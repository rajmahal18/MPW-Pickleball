import type { MatchupStage, Prisma } from "@prisma/client";
import { areGroupMatchupsComplete, computeStandings, selectDivisionQualifiers } from "@/lib/tournament/standings";
import { writeAudit } from "@/lib/audit";
import { gamesForStage } from "@/lib/tournament/rules";

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
  if (current.homeTeamId === homeTeamId && current.awayTeamId === awayTeamId) return;
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
    },
  });
}

type KnockoutDivisionRules = {
  id: string;
  tournamentId: string;
  defaultGamesPerMatchup: number;
  knockoutGamesPerMatchup: number | null;
  thirdPlaceEnabled: boolean;
};

async function ensureStageMatchups(
  db: Prisma.TransactionClient,
  division: KnockoutDivisionRules,
  stage: MatchupStage,
  count: number,
  label: string,
) {
  const desiredGames = gamesForStage(division, stage);
  const existing = await db.matchup.findMany({
    where: { divisionId: division.id, stage },
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
  const rows = await db.matchup.findMany({ where: { divisionId, stage: "THIRD_PLACE" }, include: { games: true } });
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
  qualifierIds: string[],
) {
  const count = qualifierIds.length;
  if (![2, 4, 8].includes(count)) return { supported: false, stage: null as MatchupStage | null };

  if (count === 2) {
    await removeFutureThirdPlace(db, division.id);
    const [final] = await ensureStageMatchups(db, division, "FINAL", 1, "Grand Final");
    await assignTeams(db, final.id, qualifierIds[0]!, qualifierIds[1]!);
    return { supported: true, stage: "FINAL" as MatchupStage };
  }

  if (count === 4) {
    const semifinals = await ensureStageMatchups(db, division, "SEMIFINAL", 2, "Semifinal");
    const [final] = await ensureStageMatchups(db, division, "FINAL", 1, "Grand Final");
    await assignTeams(db, semifinals[0]!.id, qualifierIds[0]!, qualifierIds[3]!);
    await assignTeams(db, semifinals[1]!.id, qualifierIds[1]!, qualifierIds[2]!);
    await assignTeams(db, final.id, semifinals[0]!.winnerTeamId, semifinals[1]!.winnerTeamId);
    await configureThirdPlace(db, division, semifinals);
    return { supported: true, stage: "SEMIFINAL" as MatchupStage };
  }

  const quarters = await ensureStageMatchups(db, division, "QUARTERFINAL", 4, "Quarterfinal");
  const semifinals = await ensureStageMatchups(db, division, "SEMIFINAL", 2, "Semifinal");
  const [final] = await ensureStageMatchups(db, division, "FINAL", 1, "Grand Final");
  for (let index = 0; index < 4; index += 1) {
    await assignTeams(db, quarters[index]!.id, qualifierIds[index]!, qualifierIds[7 - index]!);
  }
  // Official Team Event feed: SF1 = QF1 vs QF3, SF2 = QF2 vs QF4.
  await assignTeams(db, semifinals[0]!.id, quarters[0]!.winnerTeamId, quarters[2]!.winnerTeamId);
  await assignTeams(db, semifinals[1]!.id, quarters[1]!.winnerTeamId, quarters[3]!.winnerTeamId);
  await assignTeams(db, final.id, semifinals[0]!.winnerTeamId, semifinals[1]!.winnerTeamId);
  await configureThirdPlace(db, division, semifinals);
  return { supported: true, stage: "QUARTERFINAL" as MatchupStage };
}

async function clearFutureKnockoutSlots(db: Prisma.TransactionClient, divisionId: string) {
  const futureStages: MatchupStage[] = ["QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE"];
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

export async function recalculateMatchup(db: Prisma.TransactionClient, matchupId: string) {
  const matchup = await db.matchup.findUnique({
    where: { id: matchupId },
    include: { games: { orderBy: { gameNumber: "asc" } }, lineups: true },
  });
  if (!matchup) throw new Error("Team matchup not found.");

  const decidedGames = matchup.games.filter(
    (game) => (game.status === "COMPLETED" || game.status === "FORFEITED") && game.winnerTeamId,
  );
  const homeWins = decidedGames.filter((game) => game.winnerTeamId === matchup.homeTeamId).length;
  const awayWins = decidedGames.filter((game) => game.winnerTeamId === matchup.awayTeamId).length;
  const expectedGames = Math.max(1, matchup.gamesPerMatchup);
  const complete = matchup.games.length === expectedGames && decidedGames.length === expectedGames;
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

  return db.matchup.update({
    where: { id: matchupId },
    data: { homeWins, awayWins, status, winnerTeamId, version: { increment: 1 } },
  });
}

export async function recalculateTournament(
  db: Prisma.TransactionClient,
  tournamentId: string,
  audit?: { actorId?: string | null; simulationRunId?: string | null; reason?: string },
) {
  const matchupIds = await db.matchup.findMany({ where: { tournamentId }, select: { id: true } });
  for (const matchup of matchupIds) await recalculateMatchup(db, matchup.id);

  const divisions = await db.division.findMany({
    where: { tournamentId },
    include: {
      groups: { include: { standingOverrides: true, teams: { include: { group: true } } }, orderBy: { name: "asc" } },
      matchups: { include: { games: { select: { homeScore: true, awayScore: true, status: true } } }, orderBy: [{ stage: "asc" }, { order: "asc" }] },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const results: Prisma.InputJsonObject[] = [];
  for (const division of divisions) {
    const groupMatchups = division.matchups.filter((matchup) => matchup.stage === "GROUP");
    const groupTables = division.groups.map((group) =>
      computeStandings(group.teams, groupMatchups.filter((matchup) => matchup.groupLabel === group.name), group.standingOverrides),
    );
    const allGroupComplete = areGroupMatchupsComplete(groupMatchups);
    let qualifierIds: string[] = [];
    let autoKnockoutSupported = true;
    let unresolvedQualificationSlots = 0;

    if (division.autoProgression && division.formatType === "GROUP_KNOCKOUT" && allGroupComplete) {
      const selected = selectDivisionQualifiers(groupTables, division.qualifiersPerGroup, division.wildcardCount, { groupStageComplete: allGroupComplete });
      qualifierIds = selected.qualifiers.map((row) => row.team.id);
      unresolvedQualificationSlots = selected.unresolved.length;
      if (selected.unresolved.length) {
        await clearFutureKnockoutSlots(db, division.id);
        autoKnockoutSupported = false;
      } else {
        const configured = await configureAutoKnockout(db, division, qualifierIds);
        autoKnockoutSupported = configured.supported;
      }
    } else if (division.autoProgression && division.formatType === "GROUP_KNOCKOUT" && !allGroupComplete) {
      await clearFutureKnockoutSlots(db, division.id);
    }

    results.push({ divisionId: division.id, allGroupComplete, qualifierIds, autoKnockoutSupported, unresolvedQualificationSlots });
  }

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
