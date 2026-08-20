import type { MatchupStage, Prisma } from "@prisma/client";
import { areGroupMatchupsComplete, computeStandings, securedGroupSeedTeamIds, selectDivisionQualifiers, type StandingRow } from "@/lib/tournament/standings";
import { bracketWinnerQualificationSource, groupQualificationSource, parseQualificationSource, resolveQualificationSource } from "@/lib/tournament/bracket-seeding";
import { writeAudit } from "@/lib/audit";
import { gamesForStage, winsNeededForMatchup } from "@/lib/tournament/rules";
import { compactTournamentQueue } from "@/lib/tournament/queue";
import { downstreamSourceIndexes } from "@/lib/tournament/knockout-progression";
import { preparePairEntrantDivision } from "@/lib/tournament/pair-entrants";

function matchupHasStarted(matchup: { games: Array<{ status: string; homeScore: number; awayScore: number }> }) {
  return matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0);
}

async function clearFutureMatchup(db: Prisma.TransactionClient, matchupId: string) {
  const current = await db.matchup.findUnique({ where: { id: matchupId }, include: { games: true } });
  if (!current || matchupHasStarted(current)) return false;
  await db.game.deleteMany({ where: { matchupId } });
  await db.lineup.deleteMany({ where: { matchupId } });
  await db.matchup.update({
    where: { id: matchupId },
    data: {
      status: current.homeTeamId && current.awayTeamId ? "LINEUP_PENDING" : "SCHEDULED",
      homeWins: 0,
      awayWins: 0,
      winnerTeamId: null,
      version: { increment: 1 },
    },
  });
  return true;
}

async function assignTeams(
  db: Prisma.TransactionClient,
  matchupId: string,
  homeTeamId: string | null,
  awayTeamId: string | null,
) {
  const current = await db.matchup.findUnique({ where: { id: matchupId }, include: { games: true } });
  if (!current) return;
  if (current.homeTeamId === homeTeamId && current.awayTeamId === awayTeamId) {
    if ((!homeTeamId || !awayTeamId) && current.queuePosition !== null) {
      await db.matchup.update({ where: { id: matchupId }, data: { queuePosition: null, courtLabel: null, scheduledAt: null } });
    }
    return;
  }
  if (matchupHasStarted(current) || current.status === "COMPLETED" || current.status === "FORFEITED") return;
  await clearFutureMatchup(db, matchupId);
  await db.matchup.update({
    where: { id: matchupId },
    data: {
      homeTeamId,
      awayTeamId,
      status: homeTeamId && awayTeamId ? "LINEUP_PENDING" : "SCHEDULED",
      homeWins: 0,
      awayWins: 0,
      winnerTeamId: null,
      version: { increment: 1 },
      ...(!homeTeamId || !awayTeamId ? { queuePosition: null, courtLabel: null, scheduledAt: null } : {}),
    },
  });
}

type KnockoutDivisionRules = {
  id: string;
  tournamentId: string;
  defaultGamesPerMatchup: number;
  knockoutGamesPerMatchup: number | null;
  thirdPlaceEnabled: boolean;
  entrantType: string;
};

async function ensureStageMatchups(
  db: Prisma.TransactionClient,
  division: KnockoutDivisionRules,
  stage: MatchupStage,
  count: number,
  label: string,
  bracketTrack = "CHAMPIONSHIP",
) {
  const desiredGames = gamesForStage(division, stage);
  const existing = await db.matchup.findMany({
    where: { divisionId: division.id, bracketTrack, stage },
    include: { games: true },
    orderBy: { order: "asc" },
  });
  const rows = [...existing];
  let nextOrder = existing.reduce((max, row) => Math.max(max, row.order), 0) + 1;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    if (row.gamesPerMatchup === desiredGames || matchupHasStarted(row)) continue;
    await clearFutureMatchup(db, row.id);
    rows[index] = await db.matchup.update({
      where: { id: row.id },
      data: { gamesPerMatchup: desiredGames, version: { increment: 1 } },
      include: { games: true },
    });
  }

  while (rows.length < count) {
    const sequence = rows.length + 1;
    rows.push(await db.matchup.create({
      data: {
        tournamentId: division.tournamentId,
        divisionId: division.id,
        bracketTrack,
        stage,
        roundLabel: count === 1 ? label : `${label} ${sequence}`,
        roundNumber: 1,
        order: nextOrder++,
        gamesPerMatchup: desiredGames,
        status: "SCHEDULED",
      },
      include: { games: true },
    }));
  }
  return rows.slice(0, count);
}

function loserTeamId(matchup: { homeTeamId: string | null; awayTeamId: string | null; winnerTeamId: string | null }) {
  if (!matchup.winnerTeamId || !matchup.homeTeamId || !matchup.awayTeamId) return null;
  if (matchup.winnerTeamId === matchup.homeTeamId) return matchup.awayTeamId;
  if (matchup.winnerTeamId === matchup.awayTeamId) return matchup.homeTeamId;
  return null;
}

async function removeFutureThirdPlace(db: Prisma.TransactionClient, divisionId: string) {
  const rows = await db.matchup.findMany({ where: { divisionId, bracketTrack: "CHAMPIONSHIP", stage: "THIRD_PLACE" }, include: { games: true } });
  for (const row of rows) {
    if (matchupHasStarted(row) || row.status === "COMPLETED" || row.status === "FORFEITED") continue;
    await db.matchup.delete({ where: { id: row.id } });
  }
}

async function configureThirdPlace(
  db: Prisma.TransactionClient,
  division: KnockoutDivisionRules,
  semifinals: Array<{ id: string; homeTeamId: string | null; awayTeamId: string | null; winnerTeamId: string | null }>,
) {
  if (!division.thirdPlaceEnabled) {
    await removeFutureThirdPlace(db, division.id);
    return;
  }
  if (semifinals.length < 2) return;
  const [third] = await ensureStageMatchups(db, division, "THIRD_PLACE", 1, "Battle for 3rd");
  await assignTeams(db, third.id, loserTeamId(semifinals[0]!), loserTeamId(semifinals[1]!));
}

async function configureAutoKnockout(
  db: Prisma.TransactionClient,
  division: KnockoutDivisionRules,
  qualifierIds: Array<string | null>,
  qualificationContext?: { groupTables: Array<{ groupId: string; rows: StandingRow[] }>; wildcards: StandingRow[]; bracketWinners?: ReadonlyMap<string, string> },
  bracketTrack = "CHAMPIONSHIP",
) {
  const count = qualifierIds.length;
  if (![2, 4, 8].includes(count)) return { supported: false, stage: null as MatchupStage | null };

  if (count === 2) {
    if (bracketTrack === "CHAMPIONSHIP") await removeFutureThirdPlace(db, division.id);
    const [final] = await ensureStageMatchups(db, division, "FINAL", 1, bracketTrack === "CHAMPIONSHIP" ? "Grand Final" : "Wildcard Final", bracketTrack);
    await assignTeams(db, final.id, qualifierIds[0] ?? null, qualifierIds[1] ?? null);
    return { supported: true, stage: "FINAL" as MatchupStage };
  }

  if (count === 4) {
    const semifinals = await ensureStageMatchups(db, division, "SEMIFINAL", 2, bracketTrack === "CHAMPIONSHIP" ? "Semifinal" : "Wildcard Semifinal", bracketTrack);
    const [final] = await ensureStageMatchups(db, division, "FINAL", 1, bracketTrack === "CHAMPIONSHIP" ? "Grand Final" : "Wildcard Final", bracketTrack);
    const configuredSources = semifinals.flatMap((row) => [row.homeQualificationSource, row.awayQualificationSource]);
    if (configuredSources.some(Boolean) && configuredSources.every(Boolean) && qualificationContext) {
      const resolvedIds: string[] = [];
      for (const semifinal of semifinals) {
        const homeTeamId = resolveQualificationSource(semifinal.homeQualificationSource, qualificationContext.groupTables, qualificationContext.wildcards, qualificationContext.bracketWinners);
        const awayTeamId = resolveQualificationSource(semifinal.awayQualificationSource, qualificationContext.groupTables, qualificationContext.wildcards, qualificationContext.bracketWinners);
        if (!homeTeamId || !awayTeamId) {
          await assignTeams(db, semifinals[0]!.id, null, null);
          await assignTeams(db, semifinals[1]!.id, null, null);
          await assignTeams(db, final.id, null, null);
          return { supported: false, stage: "SEMIFINAL" as MatchupStage };
        }
        resolvedIds.push(homeTeamId, awayTeamId);
        await assignTeams(db, semifinal.id, homeTeamId, awayTeamId);
      }
      if (new Set(resolvedIds).size !== resolvedIds.length) return { supported: false, stage: "SEMIFINAL" as MatchupStage };
    } else {
      await assignTeams(db, semifinals[0]!.id, qualifierIds[0] ?? null, qualifierIds[3] ?? null);
      await assignTeams(db, semifinals[1]!.id, qualifierIds[1] ?? null, qualifierIds[2] ?? null);
    }
    await assignTeams(db, final.id, semifinals[0]!.winnerTeamId, semifinals[1]!.winnerTeamId);
    if (bracketTrack === "CHAMPIONSHIP") await configureThirdPlace(db, division, semifinals);
    return { supported: true, stage: "SEMIFINAL" as MatchupStage };
  }

  const quarters = await ensureStageMatchups(db, division, "QUARTERFINAL", 4, bracketTrack === "CHAMPIONSHIP" ? "Quarterfinal" : "Wildcard Quarterfinal", bracketTrack);
  const semifinals = await ensureStageMatchups(db, division, "SEMIFINAL", 2, bracketTrack === "CHAMPIONSHIP" ? "Semifinal" : "Wildcard Semifinal", bracketTrack);
  const [final] = await ensureStageMatchups(db, division, "FINAL", 1, bracketTrack === "CHAMPIONSHIP" ? "Grand Final" : "Wildcard Final", bracketTrack);

  const configuredSources = quarters.flatMap((quarter) => [quarter.homeQualificationSource, quarter.awayQualificationSource]);
  const hasConfiguredSources = configuredSources.some(Boolean);
  if (hasConfiguredSources) {
    const completeConfiguration = configuredSources.every(Boolean);
    const resolved = completeConfiguration && qualificationContext
      ? quarters.map((quarter) => ({
          homeTeamId: resolveQualificationSource(quarter.homeQualificationSource, qualificationContext.groupTables, qualificationContext.wildcards, qualificationContext.bracketWinners),
          awayTeamId: resolveQualificationSource(quarter.awayQualificationSource, qualificationContext.groupTables, qualificationContext.wildcards, qualificationContext.bracketWinners),
        }))
      : [];
    const resolvedSlots = resolved.flatMap((slot) => [slot.homeTeamId, slot.awayTeamId]);
    const resolvedIds = resolvedSlots.filter(Boolean) as string[];
    const unresolvedSourcesArePendingBracketWinners = configuredSources.every((sourceValue, index) => {
      if (resolvedSlots[index]) return true;
      return parseQualificationSource(sourceValue)?.type === "BRACKET_WINNER";
    });
    const validConfiguration = resolved.length === 4
      && new Set(configuredSources).size === configuredSources.length
      && new Set(resolvedIds).size === resolvedIds.length
      && unresolvedSourcesArePendingBracketWinners;
    if (!validConfiguration) {
      for (const quarter of quarters) await assignTeams(db, quarter.id, null, null);
      await assignTeams(db, semifinals[0]!.id, null, null);
      await assignTeams(db, semifinals[1]!.id, null, null);
      await assignTeams(db, final.id, null, null);
      return { supported: false, stage: "QUARTERFINAL" as MatchupStage };
    }
    for (let index = 0; index < 4; index += 1) {
      await assignTeams(db, quarters[index]!.id, resolved[index]!.homeTeamId, resolved[index]!.awayTeamId);
    }
  } else {
    for (let index = 0; index < 4; index += 1) {
      await assignTeams(db, quarters[index]!.id, qualifierIds[index] ?? null, qualifierIds[7 - index] ?? null);
    }
  }
  const semifinalFeeds = downstreamSourceIndexes(quarters.length, semifinals.length, division.entrantType === "TEAM" ? "CROSSED" : "STANDARD");
  for (let index = 0; index < semifinals.length; index += 1) {
    const [homeIndex, awayIndex] = semifinalFeeds[index] ?? [];
    await assignTeams(db, semifinals[index]!.id, homeIndex === undefined ? null : quarters[homeIndex]!.winnerTeamId, awayIndex === undefined ? null : quarters[awayIndex]!.winnerTeamId);
  }
  await assignTeams(db, final.id, semifinals[0]!.winnerTeamId, semifinals[1]!.winnerTeamId);
  if (bracketTrack === "CHAMPIONSHIP") await configureThirdPlace(db, division, semifinals);
  return { supported: true, stage: "QUARTERFINAL" as MatchupStage };
}

async function clearFutureKnockoutSlots(db: Prisma.TransactionClient, divisionId: string, futureStages: MatchupStage[] = ["QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE"]) {
  const future = await db.matchup.findMany({ where: { divisionId, stage: { in: futureStages } }, include: { games: true } });
  let cleared = 0;
  for (const matchup of future) {
    if (!matchupHasStarted(matchup)) {
      await assignTeams(db, matchup.id, null, null);
      cleared += 1;
    }
  }
  return cleared;
}

async function removeUnusedWildcardTrack(db: Prisma.TransactionClient, divisionId: string) {
  const rows = await db.matchup.findMany({ where: { divisionId, bracketTrack: "WILDCARD" }, include: { games: true } });
  for (const row of rows) {
    if (!matchupHasStarted(row) && row.status !== "COMPLETED" && row.status !== "FORFEITED") {
      await db.matchup.delete({ where: { id: row.id } });
    }
  }
}

async function configureWildcardPath(
  db: Prisma.TransactionClient,
  division: KnockoutDivisionRules & { wildcardMode: string; wildcardBattleSize: number },
  groupStandings: Array<{ groupId: string; rows: StandingRow[] }>,
) {
  const tables = groupStandings.map((entry) => entry.rows);
  const wildcardSlots = division.wildcardMode === "BATTLE" ? division.wildcardBattleSize : 1;
  const selection = selectDivisionQualifiers(tables, 1, wildcardSlots, { groupStageComplete: true });
  const groupWinners = groupStandings.map((entry) => entry.rows.find((row) => row.rank === 1)?.team.id ?? null);
  if (selection.unresolved.length || groupWinners.some((id) => !id)) {
    return { supported: false, qualifierIds: groupWinners.filter(Boolean) as string[], unresolved: selection.unresolved.length };
  }

  let wildcardWinnerId: string | null = selection.wildcards[0]?.team.id ?? null;
  if (division.wildcardMode === "BATTLE") {
    const battleIds = selection.wildcards.map((row) => row.team.id);
    if (![2, 4, 8].includes(battleIds.length)) return { supported: false, qualifierIds: groupWinners as string[], unresolved: 0 };
    await configureAutoKnockout(db, division, battleIds, { groupTables: groupStandings, wildcards: selection.wildcards }, "WILDCARD");
    const battleFinal = await db.matchup.findFirst({
      where: { divisionId: division.id, bracketTrack: "WILDCARD", stage: "FINAL" },
      orderBy: { order: "asc" },
    });
    wildcardWinnerId = battleFinal?.winnerTeamId ?? null;
  }

  const championshipIds = [...groupWinners, wildcardWinnerId];
  if (![2, 4, 8].includes(championshipIds.length)) {
    return { supported: false, qualifierIds: groupWinners.filter(Boolean) as string[], unresolved: 0 };
  }

  if (championshipIds.length === 8 || championshipIds.length === 4) {
    const firstStage = championshipIds.length === 8 ? "QUARTERFINAL" : "SEMIFINAL";
    const firstCount = championshipIds.length / 2;
    const rows = await ensureStageMatchups(db, division, firstStage, firstCount, firstStage === "QUARTERFINAL" ? "Quarterfinal" : "Semifinal", "CHAMPIONSHIP");
    const sources = [
      ...groupStandings.map((entry) => groupQualificationSource(entry.groupId, 1)),
      division.wildcardMode === "BATTLE" ? bracketWinnerQualificationSource("WILDCARD") : "WILDCARD:1",
    ];
    const alternateWildcardSource = division.wildcardMode === "BATTLE" ? "WILDCARD:1" : bracketWinnerQualificationSource("WILDCARD");
    const sourcePairs = Array.from({ length: firstCount }, (_, index) => [sources[index]!, sources[sources.length - 1 - index]!] as const);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      const hasSources = Boolean(row.homeQualificationSource || row.awayQualificationSource);
      await db.matchup.update({
        where: { id: row.id },
        data: hasSources
          ? {
              ...(row.homeQualificationSource === alternateWildcardSource ? { homeQualificationSource: sources.at(-1)! } : {}),
              ...(row.awayQualificationSource === alternateWildcardSource ? { awayQualificationSource: sources.at(-1)! } : {}),
            }
          : { homeQualificationSource: sourcePairs[index]![0], awayQualificationSource: sourcePairs[index]![1] },
      });
    }
  }

  const bracketWinners = new Map<string, string>();
  if (division.wildcardMode === "BATTLE" && wildcardWinnerId) bracketWinners.set("WILDCARD", wildcardWinnerId);
  const configured = await configureAutoKnockout(
    db,
    division,
    championshipIds,
    { groupTables: groupStandings, wildcards: selection.wildcards.slice(0, 1), bracketWinners },
    "CHAMPIONSHIP",
  );
  return { supported: configured.supported, qualifierIds: championshipIds.filter(Boolean) as string[], unresolved: 0 };
}

async function populateSecuredQuarterfinalSeeds(
  db: Prisma.TransactionClient,
  divisionId: string,
  securedByGroup: Map<string, Map<number, string>>,
) {
  const quarters = await db.matchup.findMany({
    where: { divisionId, stage: "QUARTERFINAL" },
    include: { games: true },
    orderBy: { order: "asc" },
  });
  const hasConfiguredSources = quarters.some((quarter) => quarter.homeQualificationSource || quarter.awayQualificationSource);
  if (!hasConfiguredSources) return false;

  const resolveEarly = (value: string | null) => {
    const source = parseQualificationSource(value);
    if (!source || source.type !== "GROUP") return null;
    return securedByGroup.get(source.groupId)?.get(source.rank) ?? null;
  };
  for (const quarter of quarters) {
    if (matchupHasStarted(quarter)) continue;
    const homeTeamId = quarter.homeQualificationSource ? resolveEarly(quarter.homeQualificationSource) : quarter.homeTeamId;
    const awayTeamId = quarter.awayQualificationSource ? resolveEarly(quarter.awayQualificationSource) : quarter.awayTeamId;
    await assignTeams(db, quarter.id, homeTeamId, awayTeamId);
    await db.matchup.update({
      where: { id: quarter.id },
      data: { status: "SCHEDULED", queuePosition: null, courtLabel: null, scheduledAt: null },
    });
  }
  return true;
}

export async function recalculateMatchup(db: Prisma.TransactionClient, matchupId: string) {
  const matchup = await db.matchup.findUnique({
    where: { id: matchupId },
    include: { games: { orderBy: { gameNumber: "asc" } }, lineups: true },
  });
  if (!matchup) throw new Error("Matchup not found.");

  const decidedGames = matchup.games.filter(
    (game) => (game.status === "COMPLETED" || game.status === "FORFEITED") && game.winnerTeamId,
  );
  const homeWins = decidedGames.filter((game) => game.winnerTeamId === matchup.homeTeamId).length;
  const awayWins = decidedGames.filter((game) => game.winnerTeamId === matchup.awayTeamId).length;
  const expectedGames = Math.max(1, matchup.gamesPerMatchup);
  const winsNeeded = winsNeededForMatchup(matchup.stage, expectedGames);
  const seriesClinched = winsNeeded !== null && (homeWins >= winsNeeded || awayWins >= winsNeeded);
  const complete = seriesClinched || (matchup.games.length === expectedGames && decidedGames.length === expectedGames);
  const hasLiveGame = matchup.games.some((game) => game.status === "LIVE" || game.status === "INTERRUPTED");
  const status = complete
    ? "COMPLETED"
    : hasLiveGame || decidedGames.length > 0
      ? "LIVE"
      : matchup.lineups.length === 2 && matchup.games.length === expectedGames
        ? "READY"
        : matchup.homeTeamId && matchup.awayTeamId
          ? "LINEUP_PENDING"
          : "SCHEDULED";
  const winnerTeamId = complete && homeWins !== awayWins
    ? homeWins > awayWins ? matchup.homeTeamId : matchup.awayTeamId
    : null;

  const updated = await db.matchup.update({
    where: { id: matchupId },
    data: { homeWins, awayWins, status, winnerTeamId, ...(complete ? { queuePosition: null } : {}), version: { increment: 1 } },
  });
  if (complete && matchup.queuePosition !== null) await compactTournamentQueue(db, matchup.tournamentId);
  return updated;
}

export async function recalculateTournament(
  db: Prisma.TransactionClient,
  tournamentId: string,
  audit?: { actorId?: string | null; simulationRunId?: string | null; reason?: string; divisionId?: string },
) {
  const matchupIds = await db.matchup.findMany({ where: { tournamentId, ...(audit?.divisionId ? { divisionId: audit.divisionId } : {}) }, select: { id: true } });
  for (const matchup of matchupIds) await recalculateMatchup(db, matchup.id);

  const divisions = await db.division.findMany({
    where: { tournamentId, ...(audit?.divisionId ? { id: audit.divisionId } : {}) },
    include: {
      groups: { include: { standingOverrides: true, teams: { include: { group: true } } }, orderBy: { name: "asc" } },
      matchups: { include: { games: { select: { homeScore: true, awayScore: true, status: true } } }, orderBy: [{ stage: "asc" }, { order: "asc" }] },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const results: Prisma.InputJsonObject[] = [];
  for (const division of divisions) {
    const groupMatchups = division.matchups.filter((matchup) => matchup.stage === "GROUP");
    const groupStandings = division.groups.map((group) => ({
      groupId: group.id,
      rows: computeStandings(group.teams, groupMatchups.filter((matchup) => matchup.groupLabel === group.name), group.standingOverrides),
    }));
    const groupTables = groupStandings.map((entry) => entry.rows);
    const allGroupComplete = areGroupMatchupsComplete(groupMatchups);
    let qualifierIds: string[] = [];
    let autoKnockoutSupported = true;
    let unresolvedQualificationSlots = 0;

    if (division.wildcardMode !== "BATTLE") await removeUnusedWildcardTrack(db, division.id);

    if (division.autoProgression && division.formatType === "GROUP_KNOCKOUT" && allGroupComplete) {
      if (division.wildcardMode === "DIRECT" || division.wildcardMode === "BATTLE") {
        const configured = await configureWildcardPath(db, division, groupStandings);
        qualifierIds = configured.qualifierIds;
        unresolvedQualificationSlots = configured.unresolved;
        autoKnockoutSupported = configured.supported;
      } else {
        const selected = selectDivisionQualifiers(groupTables, division.qualifiersPerGroup, division.wildcardCount, { groupStageComplete: allGroupComplete });
        qualifierIds = selected.qualifiers.map((row) => row.team.id);
        unresolvedQualificationSlots = selected.unresolved.length;
        if (selected.unresolved.length) {
        await clearFutureKnockoutSlots(db, division.id);
        autoKnockoutSupported = false;
        } else {
          const configured = await configureAutoKnockout(db, division, qualifierIds, { groupTables: groupStandings, wildcards: selected.wildcards });
          autoKnockoutSupported = configured.supported;
        }
      }
    } else if (division.autoProgression && division.formatType === "GROUP_KNOCKOUT" && !allGroupComplete) {
      if (division.wildcardMode === "DIRECT" || division.wildcardMode === "BATTLE") {
        const entrantCount = division.groups.length + 1;
        if ([2, 4, 8].includes(entrantCount)) {
          const pendingEntrants = Array<string | null>(entrantCount).fill(null);
          if (division.wildcardMode === "BATTLE") {
            await configureAutoKnockout(db, division, Array<string | null>(division.wildcardBattleSize).fill(null), undefined, "WILDCARD");
          }
          await configureAutoKnockout(db, division, pendingEntrants, undefined, "CHAMPIONSHIP");
        }
        await clearFutureKnockoutSlots(db, division.id);
      } else {
        const securedByGroup = new Map(division.groups.map((group) => [
          group.id,
          securedGroupSeedTeamIds(
            groupStandings.find((entry) => entry.groupId === group.id)?.rows ?? [],
            groupMatchups.filter((matchup) => matchup.groupLabel === group.name),
            division.qualifiersPerGroup,
          ),
        ]));
        const populated = await populateSecuredQuarterfinalSeeds(db, division.id, securedByGroup);
        await clearFutureKnockoutSlots(db, division.id, populated ? ["SEMIFINAL", "FINAL", "THIRD_PLACE"] : ["QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE"]);
      }
    }

    // PAIR events have fixed entrants, so newly assigned knockout slots never wait for a manager lineup.
    if (division.entrantType === "PAIR") await preparePairEntrantDivision(db, division.id);

    results.push({ divisionId: division.id, allGroupComplete, qualifierIds, autoKnockoutSupported, unresolvedQualificationSlots });
  }

  if (!audit?.divisionId) await compactTournamentQueue(db, tournamentId);

  if (audit) {
    await writeAudit(db, {
      tournamentId,
      actorId: audit.actorId,
      action: "TOURNAMENT_DEPENDENCIES_RECALCULATED",
      entityType: "Tournament",
      entityId: tournamentId,
      reason: audit.reason,
      simulation: Boolean(audit.simulationRunId),
      simulationRunId: audit.simulationRunId,
      afterState: { divisions: results },
    });
  }

  return { divisions: results };
}
