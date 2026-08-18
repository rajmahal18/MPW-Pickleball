import { NextResponse } from "next/server";
import type { PairMatchCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/permissions";
import { assertSameOrigin, redirectBack, requestData } from "@/lib/request";
import { writeAudit } from "@/lib/audit";
import { recalculateTournament } from "@/lib/tournament/recalculate";
import { computeStandings } from "@/lib/tournament/standings";
import { defaultCategoryPattern, gamesForStage } from "@/lib/tournament/rules";
import { compactTournamentQueue } from "@/lib/tournament/queue";
import { preparePairEntrantMatchup, preparePairEntrantDivision } from "@/lib/tournament/pair-entrants";
import { qualificationSourceOptions } from "@/lib/tournament/bracket-seeding";

const FORMATS = ["GROUP_KNOCKOUT", "ROUND_ROBIN", "SINGLE_ELIMINATION", "CUSTOM"] as const;
const STAGES = ["GROUP", "ROUND_ROBIN", "QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE", "CUSTOM"] as const;
const ENTRANT_TYPES = ["TEAM", "PLAYER", "PAIR"] as const;
const SEX_CATEGORIES = ["MALE", "FEMALE"] as const;
const PAIR_MATCH_CATEGORIES = ["MENS", "WOMENS", "MIXED"] as const;
const TOURNAMENT_TRANSACTION_OPTIONS = { maxWait: 10000, timeout: 30000 };

function text(value: unknown, label: string, max = 120) {
  const cleaned = String(value || "").trim();
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > max) throw new Error(`${label} is too long.`);
  return cleaned;
}
function optionalText(value: unknown, max = 500) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return null;
  if (cleaned.length > max) throw new Error("Value is too long.");
  return cleaned;
}
function normalizeConfirmation(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
function number(value: unknown, label: string, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return parsed;
}
function optionalNumber(value: unknown, label: string, min: number, max: number) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return null;
  return number(cleaned, label, min, max);
}
function slug(value: unknown) {
  const cleaned = text(value, "Slug", 80).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!cleaned) throw new Error("Enter a valid slug.");
  return cleaned;
}
function format(value: unknown) {
  if (!FORMATS.includes(value as (typeof FORMATS)[number])) throw new Error("Select a valid division format.");
  return value as typeof FORMATS[number];
}
function entrantType(value: unknown) {
  if (!ENTRANT_TYPES.includes(value as (typeof ENTRANT_TYPES)[number])) throw new Error("Select a valid entrant type.");
  return value as typeof ENTRANT_TYPES[number];
}
function optionalSexCategory(value: unknown) {
  const cleaned = String(value || "").trim().toUpperCase();
  if (!cleaned || cleaned === "ALL") return null;
  if (!SEX_CATEGORIES.includes(cleaned as (typeof SEX_CATEGORIES)[number])) throw new Error("Select a valid event sex category.");
  return cleaned as (typeof SEX_CATEGORIES)[number];
}
function stage(value: unknown) {
  if (!STAGES.includes(value as (typeof STAGES)[number])) throw new Error("Select a valid matchup stage.");
  return value as typeof STAGES[number];
}

function pairMatchCategory(value: unknown) {
  if (!PAIR_MATCH_CATEGORIES.includes(value as (typeof PAIR_MATCH_CATEGORIES)[number])) throw new Error("Select a valid match category.");
  return value as PairMatchCategory;
}

function categoryPattern(data: Record<string, unknown>, prefix: string, count: number, current: PairMatchCategory[] = [], kind: "GROUP" | "KNOCKOUT") {
  const defaults = defaultCategoryPattern(count, kind);
  return Array.from({ length: count }, (_, index) => {
    const submitted = String(data[`${prefix}-${index + 1}`] || "").trim();
    if (submitted) return pairMatchCategory(submitted);
    return current[index] ?? defaults[index]!;
  });
}


function values(value: unknown) {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => String(item || "").trim()).filter(Boolean);
}

async function started(matchupId: string) {
  const matchup = await prisma.matchup.findUnique({ where: { id: matchupId }, include: { games: true } });
  if (!matchup) throw new Error("Matchup not found.");
  return matchup.status === "COMPLETED" || matchup.status === "FORFEITED" || matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0);
}

function matchupHasRecordedPlay(matchup: { status: string; games: Array<{ status: string; homeScore: number; awayScore: number }> }) {
  return matchup.status === "COMPLETED" || matchup.status === "FORFEITED"
    || matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0);
}

async function tournamentQueueState(tournamentId: string) {
  const [tournament, matchups] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { activeCourtCount: true } }),
    prisma.matchup.findMany({
      where: { tournamentId },
      include: {
        division: { select: { name: true, sortOrder: true } },
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
        games: { select: { status: true, homeScore: true, awayScore: true } },
      },
      orderBy: [{ queuePosition: { sort: "asc", nulls: "last" } }, { division: { sortOrder: "asc" } }, { order: "asc" }],
    }),
  ]);

  const serialize = (matchup: (typeof matchups)[number]) => ({
    id: matchup.id,
    queuePosition: matchup.queuePosition,
    courtLabel: matchup.courtLabel,
    divisionName: matchup.division.name,
    homeName: matchup.homeTeam?.name ?? "TBD",
    awayName: matchup.awayTeam?.name ?? "TBD",
    homeShortName: matchup.homeTeam?.shortName ?? "TBD",
    awayShortName: matchup.awayTeam?.shortName ?? "TBD",
    gamesPerMatchup: matchup.gamesPerMatchup,
    groupLabel: matchup.groupLabel,
    stage: matchup.stage,
    roundLabel: matchup.roundLabel,
    status: matchup.status,
  });

  return {
    activeCourtCount: tournament?.activeCourtCount ?? 0,
    queuedMatchups: matchups
      .filter((matchup) => matchup.queuePosition !== null && !["COMPLETED", "FORFEITED"].includes(matchup.status))
      .map(serialize),
    availableMatchups: matchups
      .filter((matchup) => matchup.queuePosition === null && matchup.homeTeamId && matchup.awayTeamId && !matchupHasRecordedPlay(matchup))
      .map(serialize),
  };
}

async function queueMutationResponse(request: Request, tournamentId: string, message: string) {
  if (request.headers.get("x-tournament-queue") === "1") {
    return NextResponse.json({ ok: true, message, state: await tournamentQueueState(tournamentId) });
  }
  return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: message }), 303);
}

async function nextGroupPosition(tx: Prisma.TransactionClient, groupId: string) {
  const current = await tx.team.aggregate({ where: { groupId }, _max: { groupPosition: true } });
  return (current._max.groupPosition ?? 0) + 1;
}

async function syncFutureKnockoutGameCounts(
  tx: Prisma.TransactionClient,
  division: { id: string; defaultGamesPerMatchup: number; knockoutGamesPerMatchup: number | null },
) {
  const knockoutStages = ["QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE"] as const;
  const matchups = await tx.matchup.findMany({
    where: { divisionId: division.id, stage: { in: [...knockoutStages] } },
    include: { games: true },
  });
  let resetLineups = 0;
  for (const matchup of matchups) {
    const desired = gamesForStage(division, matchup.stage);
    if (desired === matchup.gamesPerMatchup || matchupHasRecordedPlay(matchup)) continue;
    await tx.game.deleteMany({ where: { matchupId: matchup.id } });
    await tx.lineup.deleteMany({ where: { matchupId: matchup.id } });
    await tx.matchup.update({
      where: { id: matchup.id },
      data: {
        gamesPerMatchup: desired,
        status: matchup.homeTeamId && matchup.awayTeamId ? "LINEUP_PENDING" : "SCHEDULED",
        homeWins: 0,
        awayWins: 0,
        winnerTeamId: null,
        version: { increment: 1 },
      },
    });
    resetLineups += 1;
  }
  return resetLineups;
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  const user = await requireSuperadmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const data = await requestData(request);
    const action = String(data.action || "");
    const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
    if (!tournament) throw new Error("Tournament not found.");

    if (action === "create-division") {
      const nextEntrantType = entrantType(data.entrantType || "TEAM");
      const nextSexCategory = optionalSexCategory(data.sexCategory);
      const requestedDefaultGames = number(data.defaultGamesPerMatchup || 1, "Group/default matches per matchup", 1, 31);
      const requestedKnockoutGames = optionalNumber(data.knockoutGamesPerMatchup, "Knockout matches per matchup", 1, 31);
      const created = await prisma.$transaction(async (tx) => {
        const division = await tx.division.create({
          data: {
            tournamentId: tournament.id,
            name: text(data.name, "Division name"),
            slug: slug(data.slug || data.name),
            formatType: format(data.formatType || "CUSTOM"),
            entrantType: nextEntrantType,
            sexCategory: nextSexCategory,
            defaultGamesPerMatchup: nextEntrantType === "PAIR" ? 1 : requestedDefaultGames,
            knockoutGamesPerMatchup: nextEntrantType === "PAIR" ? 1 : requestedKnockoutGames,
            groupMatchCategories: [],
            knockoutMatchCategories: [],
            groupCategoryRulesEnabled: false,
            knockoutCategoryRulesEnabled: false,
            qualifiersPerGroup: number(data.qualifiersPerGroup || 1, "Qualifiers per group", 0, 16),
            wildcardCount: number(data.wildcardCount || 0, "Wildcard count", 0, 16),
            autoProgression: data.autoProgression === "on",
            thirdPlaceEnabled: data.thirdPlaceEnabled === "on",
            suddenDeathAtTen: data.suddenDeathAtTen === "on",
            advancementRule: optionalText(data.advancementRule),
            guideNotes: optionalText(data.guideNotes),
            sortOrder: number(data.sortOrder || 0, "Sort order", 0, 999),
          },
        });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "DIVISION_CREATED", entityType: "Division", entityId: division.id, afterState: { name: division.name, formatType: division.formatType } });
        return division;
      });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: `${created.name} created.` }), 303);
    }

    if (action === "update-division") {
      const divisionId = text(data.divisionId, "Division ID");
      const before = await prisma.division.findUnique({ where: { id: divisionId } });
      if (!before || before.tournamentId !== tournament.id) throw new Error("Division not found.");
      const requestedDefaultGames = number(data.defaultGamesPerMatchup, "Group/default matches per matchup", 1, 31);
      const requestedKnockoutGames = optionalNumber(data.knockoutGamesPerMatchup, "Knockout matches per matchup", 1, 31);
      const preserveLineupRules = data.preserveLineupRules === "1";
      const nextEntrantType = entrantType(data.entrantType || before.entrantType);
      const nextSexCategory = optionalSexCategory(data.sexCategory);
      if (nextEntrantType !== before.entrantType) {
        const [recordedPlay, existingEntrants, existingMatchups] = await Promise.all([
          prisma.matchup.findFirst({
            where: { divisionId, OR: [{ status: { in: ["COMPLETED", "FORFEITED", "LIVE", "INTERRUPTED"] } }, { games: { some: { OR: [{ status: { not: "SCHEDULED" } }, { homeScore: { not: 0 } }, { awayScore: { not: 0 } }] } } }] },
            select: { id: true },
          }),
          prisma.team.count({ where: { divisionId } }),
          prisma.matchup.count({ where: { divisionId } }),
        ]);
        if (recordedPlay) throw new Error("Entrant type cannot change after play has been recorded.");
        if (existingEntrants || existingMatchups) throw new Error("Change entrant type only while the division is empty. Remove unplayed entrants and matchups first so Team Event and fixed-pair data cannot be mixed.");
      }
      if (nextSexCategory !== before.sexCategory) {
        const [existingEntrants, existingEntries, existingMatchups] = await Promise.all([
          prisma.team.count({ where: { divisionId } }),
          prisma.divisionPlayer.count({ where: { divisionId } }),
          prisma.matchup.count({ where: { divisionId } }),
        ]);
        if (existingEntrants || existingEntries || existingMatchups) throw new Error("Change the event sex category only while the division is empty so existing entrants cannot become invalid.");
      }
      const nextDefaultGames = nextEntrantType === "PAIR" ? 1 : requestedDefaultGames;
      const nextKnockoutGames = nextEntrantType === "PAIR" ? 1 : requestedKnockoutGames;
      const next = {
        name: text(data.name, "Division name"),
        slug: slug(data.slug),
        formatType: format(data.formatType),
        entrantType: nextEntrantType,
        sexCategory: nextSexCategory,
        defaultGamesPerMatchup: nextDefaultGames,
        knockoutGamesPerMatchup: nextKnockoutGames,
        groupMatchCategories: nextEntrantType === "PAIR" ? [] : (preserveLineupRules ? before.groupMatchCategories : categoryPattern(data, "groupCategory", nextDefaultGames, before.groupMatchCategories, "GROUP")),
        knockoutMatchCategories: nextEntrantType === "PAIR" ? [] : (preserveLineupRules ? before.knockoutMatchCategories : categoryPattern(data, "knockoutCategory", nextKnockoutGames ?? nextDefaultGames, before.knockoutMatchCategories, "KNOCKOUT")),
        groupCategoryRulesEnabled: nextEntrantType === "PAIR" ? false : (preserveLineupRules ? before.groupCategoryRulesEnabled : data.groupCategoryRulesEnabled === "on"),
        knockoutCategoryRulesEnabled: nextEntrantType === "PAIR" ? false : (preserveLineupRules ? before.knockoutCategoryRulesEnabled : data.knockoutCategoryRulesEnabled === "on"),
        qualifiersPerGroup: number(data.qualifiersPerGroup, "Qualifiers per group", 0, 16),
        wildcardCount: number(data.wildcardCount, "Wildcard count", 0, 16),
        autoProgression: data.autoProgression === "on",
        thirdPlaceEnabled: data.thirdPlaceEnabled === "on",
        suddenDeathAtTen: data.suddenDeathAtTen === "on",
        advancementRule: optionalText(data.advancementRule),
        guideNotes: optionalText(data.guideNotes),
        isPublic: data.isPublic === "on",
        sortOrder: number(data.sortOrder, "Sort order", 0, 999),
      };
      if (before.thirdPlaceEnabled && !next.thirdPlaceEnabled) {
        const playedThirdPlace = await prisma.matchup.findFirst({
          where: { divisionId, stage: "THIRD_PLACE", OR: [{ status: { in: ["COMPLETED", "FORFEITED", "LIVE", "INTERRUPTED"] } }, { games: { some: { OR: [{ status: { not: "SCHEDULED" } }, { homeScore: { not: 0 } }, { awayScore: { not: 0 } }] } } }] },
          select: { id: true },
        });
        if (playedThirdPlace) throw new Error("Battle for 3rd already has recorded play and cannot be disabled.");
      }
      await prisma.$transaction(async (tx) => {
        await tx.division.update({ where: { id: divisionId }, data: next });
        await syncFutureKnockoutGameCounts(tx, { id: divisionId, defaultGamesPerMatchup: next.defaultGamesPerMatchup, knockoutGamesPerMatchup: next.knockoutGamesPerMatchup });
        await recalculateTournament(tx, tournament.id, { actorId: user.id, reason: `Division settings changed: ${next.name}` });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "DIVISION_UPDATED", entityType: "Division", entityId: divisionId, beforeState: { formatType: before.formatType, entrantType: before.entrantType, sexCategory: before.sexCategory, defaultGamesPerMatchup: before.defaultGamesPerMatchup, knockoutGamesPerMatchup: before.knockoutGamesPerMatchup, autoProgression: before.autoProgression, thirdPlaceEnabled: before.thirdPlaceEnabled, suddenDeathAtTen: before.suddenDeathAtTen }, afterState: next });
      }, TOURNAMENT_TRANSACTION_OPTIONS);
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: "Division settings updated." }), 303);
    }

    if (action === "update-lineup-rules") {
      const divisionId = text(data.divisionId, "Division ID");
      const division = await prisma.division.findUnique({ where: { id: divisionId } });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      if (division.entrantType === "PAIR") throw new Error("Fixed-pair events do not use team lineup category rules.");
      const groupMatchCategories = categoryPattern(data, "groupCategory", division.defaultGamesPerMatchup, division.groupMatchCategories, "GROUP");
      const knockoutCount = division.knockoutGamesPerMatchup ?? division.defaultGamesPerMatchup;
      const knockoutMatchCategories = categoryPattern(data, "knockoutCategory", knockoutCount, division.knockoutMatchCategories, "KNOCKOUT");
      const next = {
        groupMatchCategories,
        knockoutMatchCategories,
        groupCategoryRulesEnabled: data.groupCategoryRulesEnabled === "on",
        knockoutCategoryRulesEnabled: data.knockoutCategoryRulesEnabled === "on",
      };
      await prisma.$transaction(async (tx) => {
        await tx.division.update({ where: { id: divisionId }, data: next });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "LINEUP_RULES_UPDATED", entityType: "Division", entityId: divisionId, afterState: next });
      }, TOURNAMENT_TRANSACTION_OPTIONS);
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: "Lineup match categories updated." }), 303);
    }

    if (action === "delete-division") {
      const divisionId = text(data.divisionId, "Division ID");
      const confirmation = text(data.confirmDivisionName, "Confirmation", 120);
      const division = await prisma.division.findUnique({
        where: { id: divisionId },
        include: {
          groups: { select: { id: true } },
          teams: { select: { id: true } },
          matchups: { include: { games: { include: { scoreEvents: { select: { id: true }, take: 1 } } } } },
          playerEntries: { select: { id: true } },
        },
      });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      if (normalizeConfirmation(confirmation) !== normalizeConfirmation(division.name)) {
        throw new Error(`Type "${division.name}" to delete this division.`);
      }

      const hasRecordedPlay = division.matchups.some((matchup) => matchup.status === "COMPLETED" || matchup.status === "FORFEITED"
        || matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0 || game.scoreEvents.length > 0));
      if (hasRecordedPlay) throw new Error("A division with recorded play cannot be deleted. Set it private or rename it to preserve history.");

      const matchupIds = division.matchups.map((matchup) => matchup.id);
      const teamIds = division.teams.map((team) => team.id);
      await prisma.$transaction(async (tx) => {
        if (matchupIds.length) {
          await tx.game.deleteMany({ where: { matchupId: { in: matchupIds } } });
          await tx.lineup.deleteMany({ where: { matchupId: { in: matchupIds } } });
          await tx.matchup.deleteMany({ where: { id: { in: matchupIds } } });
        }
        if (teamIds.length) {
          await tx.lineup.deleteMany({ where: { teamId: { in: teamIds } } });
          await tx.player.updateMany({ where: { teamId: { in: teamIds } }, data: { teamId: null } });
          await tx.user.updateMany({ where: { teamId: { in: teamIds } }, data: { teamId: null } });
          await tx.pair.deleteMany({ where: { teamId: { in: teamIds } } });
          await tx.team.deleteMany({ where: { id: { in: teamIds } } });
        }
        await tx.group.deleteMany({ where: { divisionId } });
        await tx.divisionPlayer.deleteMany({ where: { divisionId } });
        await tx.division.delete({ where: { id: divisionId } });
        await compactTournamentQueue(tx, tournament.id);
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "DIVISION_DELETED",
          entityType: "Division",
          entityId: divisionId,
          beforeState: {
            name: division.name,
            formatType: division.formatType,
            groupCount: division.groups.length,
            teamCount: division.teams.length,
            matchupCount: division.matchups.length,
            playerEntryCount: division.playerEntries.length,
          },
          afterState: { teamsRemoved: teamIds.length, assignedPlayersReturnedToPool: true },
        });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: `${division.name} deleted. Assigned players were returned to the pool.` }), 303);
    }

    if (action === "create-group") {
      const divisionId = text(data.divisionId, "Division ID");
      const division = await prisma.division.findUnique({ where: { id: divisionId } });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      const group = await prisma.group.create({ data: { tournamentId: tournament.id, divisionId, name: text(data.name, "Group name"), slug: slug(data.slug || data.name) } });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: `${group.name} created.` }), 303);
    }

    if (action === "update-group") {
      const groupId = text(data.groupId, "Group ID");
      const before = await prisma.group.findUnique({ where: { id: groupId }, include: { division: true } });
      if (!before || before.tournamentId !== tournament.id) throw new Error("Group not found.");
      const nextName = text(data.name, "Group name");
      const nextSlug = slug(data.slug || data.name);
      await prisma.$transaction(async (tx) => {
        await tx.group.update({ where: { id: groupId }, data: { name: nextName, slug: nextSlug } });
        if (nextName !== before.name) {
          await tx.matchup.updateMany({
            where: { tournamentId: tournament.id, divisionId: before.divisionId, stage: "GROUP", groupLabel: before.name },
            data: { groupLabel: nextName },
          });
        }
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "GROUP_UPDATED",
          entityType: "Group",
          entityId: groupId,
          beforeState: { name: before.name, slug: before.slug },
          afterState: { name: nextName, slug: nextSlug },
        });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: `${nextName} updated.` }), 303);
    }

    if (action === "save-group-tiebreak") {
      const groupId = text(data.groupId, "Group ID");
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          division: true,
          teams: { include: { group: true } },
        },
      });
      if (!group || group.tournamentId !== tournament.id) throw new Error("Group not found.");
      const tiedTeamIds = values(data.tiedTeamIds);
      if (tiedTeamIds.length < 2) throw new Error("Select at least two tied teams.");
      const selectedTeamIds = tiedTeamIds.map((_, index) => text(data[`rank-${index + 1}`], `Rank ${index + 1}`));
      if (new Set(selectedTeamIds).size !== selectedTeamIds.length) throw new Error("Each tied team can appear only once.");
      if (selectedTeamIds.some((teamId) => !tiedTeamIds.includes(teamId))) throw new Error("Tiebreak order contains a team outside this tie.");

      const matchups = await prisma.matchup.findMany({ where: { tournamentId: tournament.id, divisionId: group.divisionId, stage: "GROUP", groupLabel: group.name }, include: { games: { select: { homeScore: true, awayScore: true, status: true } } } });
      const standings = computeStandings(group.teams, matchups);
      const actualTie = new Map<string, string[]>();
      for (const row of standings) {
        if (!row.tieGroupKey) continue;
        const ids = actualTie.get(row.tieGroupKey) ?? [];
        ids.push(row.team.id);
        actualTie.set(row.tieGroupKey, ids);
      }
      const requestedSet = [...tiedTeamIds].sort().join("|");
      const isValidTie = [...actualTie.values()].some((ids) => ids.length === tiedTeamIds.length && ids.sort().join("|") === requestedSet);
      if (!isValidTie) throw new Error("These teams are not currently tied on the standings metrics.");
      const tiedStandingsRows = standings.filter((row) => tiedTeamIds.includes(row.team.id));
      const baseRank = Math.min(...tiedStandingsRows.map((row) => row.rank));

      await prisma.$transaction(async (tx) => {
        await tx.groupStandingOverride.deleteMany({ where: { groupId, teamId: { in: tiedTeamIds } } });
        for (const [index, teamId] of selectedTeamIds.entries()) {
          await tx.groupStandingOverride.create({ data: { groupId, teamId, position: baseRank + index } });
        }
        await recalculateTournament(tx, tournament.id, { actorId: user.id, reason: `Standing tiebreak saved: ${group.name}` });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "GROUP_STANDING_TIEBREAK_SAVED",
          entityType: "Group",
          entityId: groupId,
          afterState: { groupName: group.name, teamIds: selectedTeamIds },
        });
      }, TOURNAMENT_TRANSACTION_OPTIONS);
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: `${group.name} tiebreak order saved.` }), 303);
    }

    if (action === "clear-group-tiebreak") {
      const groupId = text(data.groupId, "Group ID");
      const group = await prisma.group.findUnique({ where: { id: groupId }, include: { division: true } });
      if (!group || group.tournamentId !== tournament.id) throw new Error("Group not found.");
      const deleted = await prisma.$transaction(async (tx) => {
        const result = await tx.groupStandingOverride.deleteMany({ where: { groupId } });
        await recalculateTournament(tx, tournament.id, { actorId: user.id, reason: `Standing tiebreak cleared: ${group.name}` });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "GROUP_STANDING_TIEBREAK_CLEARED",
          entityType: "Group",
          entityId: groupId,
          beforeState: { groupName: group.name, rowsDeleted: result.count },
        });
        return result.count;
      }, TOURNAMENT_TRANSACTION_OPTIONS);
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: deleted ? `${group.name} tiebreak order cleared.` : "No tiebreak order was saved." }), 303);
    }

    if (action === "delete-group") {
      const groupId = text(data.groupId, "Group ID");
      const group = await prisma.group.findUnique({ where: { id: groupId }, include: { teams: { select: { id: true } }, division: true } });
      if (!group || group.tournamentId !== tournament.id) throw new Error("Group not found.");
      const groupMatchups = await prisma.matchup.findMany({
        where: { tournamentId: tournament.id, divisionId: group.divisionId, stage: "GROUP", groupLabel: group.name },
        include: { games: true },
      });
      const hasRecordedPlay = groupMatchups.some((matchup) => matchup.status === "COMPLETED" || matchup.status === "FORFEITED"
        || matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0));
      if (hasRecordedPlay) throw new Error("A group with recorded play cannot be removed. Rename it or keep it for history.");
      await prisma.$transaction(async (tx) => {
        const matchupIds = groupMatchups.map((matchup) => matchup.id);
        if (matchupIds.length) {
          await tx.game.deleteMany({ where: { matchupId: { in: matchupIds } } });
          await tx.lineup.deleteMany({ where: { matchupId: { in: matchupIds } } });
          await tx.matchup.deleteMany({ where: { id: { in: matchupIds } } });
        }
        await tx.team.updateMany({ where: { groupId }, data: { groupId: null, groupPosition: null } });
        await tx.group.delete({ where: { id: groupId } });
        await recalculateTournament(tx, tournament.id, { actorId: user.id, reason: `Group removed: ${group.name}` });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "GROUP_DELETED",
          entityType: "Group",
          entityId: groupId,
          beforeState: { name: group.name, teamCount: group.teams.length, futureMatchupsRemoved: matchupIds.length },
        });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: `${group.name} removed. Its teams are now ungrouped; only unplayed group matchups were deleted.` }), 303);
    }

    if (action === "create-team") {
      const divisionId = text(data.divisionId, "Division ID");
      const groupId = optionalText(data.groupId);
      const groupPosition = groupId ? optionalNumber(data.groupPosition, "Group position", 1, 99) : null;
      const division = await prisma.division.findUnique({ where: { id: divisionId } });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      if (division.entrantType === "PAIR") throw new Error("Create fixed pair entrants from Player Pool for this event instead of creating a team wrapper directly.");
      if (groupId) {
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group || group.divisionId !== divisionId) throw new Error("Group does not belong to this division.");
        if (groupPosition) {
          const duplicate = await prisma.team.findFirst({ where: { groupId, groupPosition }, select: { name: true } });
          if (duplicate) throw new Error(`${group.name} slot ${groupPosition} is already assigned to ${duplicate.name}.`);
        }
      }
      const team = await prisma.team.create({ data: { divisionId, groupId, groupPosition, name: text(data.name, "Team name"), shortName: text(data.shortName, "Short name", 20) } });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: `${team.name} created.` }), 303);
    }

    if (action === "delete-team") {
      const teamId = text(data.teamId, "Team ID");
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: { division: true, players: { select: { id: true } }, pairs: { select: { id: true } } },
      });
      if (!team || team.division.tournamentId !== tournament.id) throw new Error("Team not found.");
      const affected = await prisma.matchup.findMany({
        where: { tournamentId: tournament.id, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }, { winnerTeamId: teamId }] },
        include: { games: true },
      });
      const directGames = await prisma.game.findMany({
        where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
        select: { status: true, homeScore: true, awayScore: true },
      });
      const hasRecordedPlay = affected.some((matchup) => matchup.status === "COMPLETED" || matchup.status === "FORFEITED"
        || matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0))
        || directGames.some((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0);
      if (hasRecordedPlay) throw new Error("An entrant with recorded play cannot be deleted. Keep it for historical integrity.");

      await prisma.$transaction(async (tx) => {
        for (const matchup of affected) {
          await tx.game.deleteMany({ where: { matchupId: matchup.id } });
          await tx.lineup.deleteMany({ where: { matchupId: matchup.id } });
          await tx.matchup.update({
            where: { id: matchup.id },
            data: {
              ...(matchup.homeTeamId === teamId ? { homeTeamId: null } : {}),
              ...(matchup.awayTeamId === teamId ? { awayTeamId: null } : {}),
              ...(matchup.winnerTeamId === teamId ? { winnerTeamId: null } : {}),
              homeWins: 0,
              awayWins: 0,
              status: "SCHEDULED",
              queuePosition: null,
              courtLabel: null,
              scheduledAt: null,
              version: { increment: 1 },
            },
          });
        }
        // Clean any stale future artifacts keyed directly to the team, then return players to the pool instead of deleting them.
        await tx.game.deleteMany({ where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } });
        await tx.lineup.deleteMany({ where: { teamId } });
        await tx.player.updateMany({ where: { teamId }, data: { teamId: null } });
        await tx.pair.deleteMany({ where: { teamId } });
        await tx.team.delete({ where: { id: teamId } });
        await recalculateTournament(tx, tournament.id, { actorId: user.id, reason: `Unplayed team removed: ${team.name}` });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "TEAM_DELETED",
          entityType: "Team",
          entityId: teamId,
          beforeState: { name: team.name, divisionId: team.divisionId, playerCount: team.players.length, pairCount: team.pairs.length },
          afterState: { playersReturnedToPool: team.players.length, futureMatchupsCleared: affected.length },
        });
      });
      const success = team.division.entrantType === "PAIR"
        ? `${team.name} pair entrant removed. Team Event roster assignments were left untouched and future matchup slots were cleared.`
        : `${team.name} removed. Its players returned to the unassigned pool and future matchup slots were cleared.`;
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success }), 303);
    }

    if (action === "update-team-identity") {
      const teamId = text(data.teamId, "Team ID");
      const before = await prisma.team.findUnique({ where: { id: teamId }, include: { division: true } });
      if (!before || before.division.tournamentId !== tournament.id) throw new Error("Team not found.");
      const next = { name: text(data.name, "Team name", 100), shortName: text(data.shortName, "Short name", 20) };
      await prisma.$transaction(async (tx) => {
        await tx.team.update({ where: { id: teamId }, data: next });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "TEAM_IDENTITY_UPDATED", entityType: "Team", entityId: teamId, beforeState: { name: before.name, shortName: before.shortName }, afterState: next });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: `${next.name} updated.` }), 303);
    }

    if (action === "bulk-assign-team-groups") {
      const divisionId = text(data.divisionId, "Division ID");
      const division = await prisma.division.findUnique({
        where: { id: divisionId },
        include: { groups: { select: { id: true, name: true } }, teams: { select: { id: true, name: true, shortName: true, groupId: true, groupPosition: true } } },
      });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      if (!Array.isArray(data.assignments)) throw new Error("Group assignments are missing or invalid.");

      const assignments = data.assignments.map((value, index) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Assignment ${index + 1} is invalid.`);
        const record = value as Record<string, unknown>;
        const teamId = text(record.teamId, `Assignment ${index + 1} team ID`);
        const groupId = optionalText(record.groupId, 120);
        const groupPosition = groupId ? number(record.groupPosition, `Assignment ${index + 1} position`, 1, 99) : null;
        return { teamId, groupId, groupPosition };
      });

      const currentTeamIds = new Set(division.teams.map((team) => team.id));
      const submittedTeamIds = new Set(assignments.map((assignment) => assignment.teamId));
      if (assignments.length !== division.teams.length || submittedTeamIds.size !== assignments.length || [...currentTeamIds].some((teamId) => !submittedTeamIds.has(teamId))) {
        throw new Error("The team list changed while you were arranging groups. Refresh Tournament Setup and try again.");
      }
      const allowedGroupIds = new Set(division.groups.map((group) => group.id));
      if (assignments.some((assignment) => assignment.groupId && !allowedGroupIds.has(assignment.groupId))) throw new Error("One or more destination groups is invalid.");

      for (const group of division.groups) {
        const positions = assignments.filter((assignment) => assignment.groupId === group.id).map((assignment) => assignment.groupPosition).sort((a, b) => (a ?? 0) - (b ?? 0));
        if (positions.some((position, index) => position !== index + 1)) throw new Error(`${group.name} positions are invalid. Refresh and try again.`);
      }

      const changed = assignments.some((assignment) => {
        const current = division.teams.find((team) => team.id === assignment.teamId)!;
        return current.groupId !== assignment.groupId || current.groupPosition !== assignment.groupPosition;
      });
      if (!changed) {
        const message = "Group assignments are already up to date.";
        if (request.headers.get("x-group-assignment") === "1") return NextResponse.json({ ok: true, message });
        return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: message }), 303);
      }

      const divisionMatchups = await prisma.matchup.findMany({
        where: { tournamentId: tournament.id, divisionId },
        include: { games: true },
      });
      const hasRecordedDivisionPlay = divisionMatchups.some((matchup) =>
        ["LIVE", "COMPLETED", "FORFEITED", "INTERRUPTED"].includes(matchup.status) || matchupHasRecordedPlay(matchup),
      );
      if (hasRecordedDivisionPlay) throw new Error("Group assignment is locked because recorded play already exists in this division.");
      const groupMatchups = divisionMatchups.filter((matchup) => matchup.stage === "GROUP");

      const shouldResetUnplayedGroupMatchups = data.resetUnplayedGroupMatchups === true || String(data.resetUnplayedGroupMatchups || "").toLowerCase() === "true";
      if (groupMatchups.length && !shouldResetUnplayedGroupMatchups) throw new Error("Generated group matchups must be cleared before changing the draw.");

      const beforePlacements = division.teams.map((team) => ({ teamId: team.id, groupId: team.groupId, groupPosition: team.groupPosition }));
      const groupIds = division.groups.map((group) => group.id);
      const matchupIds = groupMatchups.map((matchup) => matchup.id);
      await prisma.$transaction(async (tx) => {
        if (matchupIds.length) {
          await tx.game.deleteMany({ where: { matchupId: { in: matchupIds } } });
          await tx.lineup.deleteMany({ where: { matchupId: { in: matchupIds } } });
          await tx.matchup.deleteMany({ where: { id: { in: matchupIds } } });
        }
        if (groupIds.length) await tx.groupStandingOverride.deleteMany({ where: { groupId: { in: groupIds } } });

        // Clear positions first so the unique group-slot constraint cannot collide while teams move around.
        await tx.team.updateMany({ where: { divisionId }, data: { groupPosition: null } });
        for (const assignment of assignments) {
          await tx.team.update({
            where: { id: assignment.teamId },
            data: { groupId: assignment.groupId, groupPosition: assignment.groupPosition },
          });
        }
        await compactTournamentQueue(tx, tournament.id);
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "GROUP_ASSIGNMENTS_BULK_UPDATED",
          entityType: "Division",
          entityId: divisionId,
          beforeState: { placements: beforePlacements, clearedUnplayedGroupMatchups: matchupIds.length },
          afterState: { placements: assignments },
        });
      }, TOURNAMENT_TRANSACTION_OPTIONS);

      const message = `Group assignments saved${matchupIds.length ? `; ${matchupIds.length} unplayed group matchup${matchupIds.length === 1 ? " was" : "s were"} cleared for regeneration` : ""}.`;
      if (request.headers.get("x-group-assignment") === "1") return NextResponse.json({ ok: true, message });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: message }), 303);
    }

    if (action === "update-team-structure") {
      const teamId = text(data.teamId, "Team ID");
      const before = await prisma.team.findUnique({ where: { id: teamId }, include: { division: true } });
      if (!before || before.division.tournamentId !== tournament.id) throw new Error("Team not found.");
      const divisionId = text(data.divisionId, "Division ID");
      const groupId = optionalText(data.groupId);
      const groupPosition = groupId ? optionalNumber(data.groupPosition, "Group position", 1, 99) : null;
      const targetDivision = await prisma.division.findUnique({ where: { id: divisionId } });
      if (!targetDivision || targetDivision.tournamentId !== tournament.id) throw new Error("Destination division not found.");
      if (divisionId !== before.divisionId && (before.division.entrantType === "PAIR" || targetDivision.entrantType === "PAIR")) throw new Error("Fixed-pair entrants cannot be moved between event types. Remove the unplayed pair and recreate it in the correct Executive event instead.");
      if (divisionId !== before.divisionId && targetDivision.entrantType !== before.division.entrantType) throw new Error("Entrants cannot be moved between divisions with different entrant types.");
      const placementChange = groupId !== before.groupId || groupPosition !== before.groupPosition;
      const fixtureChange = divisionId !== before.divisionId || groupId !== before.groupId;
      if (groupId) {
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group || group.divisionId !== divisionId) throw new Error("Group does not belong to the selected division.");
        if (groupPosition) {
          const duplicate = await prisma.team.findFirst({ where: { groupId, groupPosition, id: { not: teamId } }, select: { name: true } });
          if (duplicate) throw new Error(`${group.name} slot ${groupPosition} is already assigned to ${duplicate.name}.`);
        }
      }
      if (placementChange || divisionId !== before.divisionId) {
        const played = await prisma.game.findFirst({ where: { status: { in: ["LIVE", "COMPLETED", "FORFEITED", "INTERRUPTED"] }, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } });
        if (played) throw new Error("A team with recorded play cannot be moved to another division/group slot.");

        await prisma.$transaction(async (tx) => {
          const affected = fixtureChange
            ? await tx.matchup.findMany({
              where: { tournamentId: tournament.id, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
              include: { games: true },
            })
            : [];
          for (const matchup of affected) {
            const hasRecordedPlay = matchup.status === "COMPLETED" || matchup.status === "FORFEITED"
              || matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0);
            if (hasRecordedPlay) throw new Error("A team with recorded play cannot be moved to another division/group slot.");
            await tx.game.deleteMany({ where: { matchupId: matchup.id } });
            await tx.lineup.deleteMany({ where: { matchupId: matchup.id } });
            await tx.matchup.update({
              where: { id: matchup.id },
              data: {
                ...(matchup.homeTeamId === teamId ? { homeTeamId: null } : {}),
                ...(matchup.awayTeamId === teamId ? { awayTeamId: null } : {}),
                homeWins: 0,
                awayWins: 0,
                winnerTeamId: null,
                status: "SCHEDULED",
                queuePosition: null,
                courtLabel: null,
                scheduledAt: null,
                version: { increment: 1 },
              },
            });
          }
          await compactTournamentQueue(tx, tournament.id);
          await tx.team.update({ where: { id: teamId }, data: { divisionId, groupId, groupPosition } });
          if (divisionId !== before.divisionId) {
            const members = await tx.player.findMany({ where: { teamId }, select: { id: true, participationStatus: true } });
            for (const member of members) {
              const nextStatus = member.participationStatus === "CONFIRMED"
                ? "CONFIRMED"
                : member.participationStatus === "UNAVAILABLE"
                  ? "UNAVAILABLE"
                  : member.participationStatus === "WITHDRAWN"
                    ? "WITHDRAWN"
                    : "ELIGIBLE";
              await tx.divisionPlayer.upsert({
                where: { divisionId_playerId: { divisionId, playerId: member.id } },
                update: { status: nextStatus },
                create: { divisionId, playerId: member.id, status: nextStatus },
              });
            }
          }
          await writeAudit(tx, {
            tournamentId: tournament.id,
            actorId: user.id,
            action: "TEAM_STRUCTURE_UPDATED",
            entityType: "Team",
            entityId: teamId,
            beforeState: { divisionId: before.divisionId, groupId: before.groupId, groupPosition: before.groupPosition },
            afterState: { divisionId, groupId, groupPosition, invalidatedFutureMatchups: affected.length },
          });
        });
      } else {
        await prisma.team.update({ where: { id: teamId }, data: { divisionId, groupId, groupPosition } });
      }
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: fixtureChange ? "Team moved. Its future matchup slots were cleared safely; recorded history was untouched." : "Team placement updated." }), 303);
    }

    if (action === "auto-number-group-slots") {
      const divisionId = text(data.divisionId, "Division ID");
      const division = await prisma.division.findUnique({
        where: { id: divisionId },
        include: { groups: { include: { teams: { orderBy: [{ groupPosition: "asc" }, { shortName: "asc" }, { name: "asc" }] } }, orderBy: { name: "asc" } } },
      });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      if (!division.groups.length) throw new Error("Create groups before numbering slots.");
      const teamIds = division.groups.flatMap((group) => group.teams.map((team) => team.id));
      if (teamIds.length) {
        const played = await prisma.game.findFirst({ where: { status: { in: ["LIVE", "COMPLETED", "FORFEITED", "INTERRUPTED"] }, OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }] } });
        if (played) throw new Error("One or more grouped teams already has recorded play, so automatic slot renumbering is blocked.");
      }

      let updated = 0;
      await prisma.$transaction(async (tx) => {
        for (const group of division.groups) {
          const orderedTeams = [...group.teams].sort((first, second) => (first.groupPosition ?? 999) - (second.groupPosition ?? 999) || first.shortName.localeCompare(second.shortName) || first.name.localeCompare(second.name));
          await tx.team.updateMany({ where: { id: { in: orderedTeams.map((team) => team.id) } }, data: { groupPosition: null } });
          for (const [index, team] of orderedTeams.entries()) {
            const nextPosition = index + 1;
            if (team.groupPosition !== nextPosition) {
              updated += 1;
            }
            await tx.team.update({ where: { id: team.id }, data: { groupPosition: nextPosition } });
          }
        }
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "GROUP_SLOTS_AUTO_NUMBERED", entityType: "Division", entityId: divisionId, afterState: { updatedTeams: updated } });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: updated ? `${updated} group slots renumbered.` : "Group slots were already numbered." }), 303);
    }

    if (action === "auto-distribute-ungrouped-teams") {
      const divisionId = text(data.divisionId, "Division ID");
      const division = await prisma.division.findUnique({
        where: { id: divisionId },
        include: {
          groups: { include: { teams: { select: { id: true } } }, orderBy: { name: "asc" } },
          teams: { where: { groupId: null }, orderBy: [{ shortName: "asc" }, { name: "asc" }] },
        },
      });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      if (!division.groups.length) throw new Error("Create groups before distributing teams.");
      if (!division.teams.length) throw new Error("No ungrouped teams to distribute.");
      const teamIds = division.teams.map((team) => team.id);
      const played = await prisma.game.findFirst({ where: { status: { in: ["LIVE", "COMPLETED", "FORFEITED", "INTERRUPTED"] }, OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }] } });
      if (played) throw new Error("One or more ungrouped teams already has recorded play, so automatic distribution is blocked.");

      let assigned = 0;
      await prisma.$transaction(async (tx) => {
        const groups = division.groups.map((group) => ({ id: group.id, count: group.teams.length }));
        for (const team of division.teams) {
          groups.sort((first, second) => first.count - second.count || first.id.localeCompare(second.id));
          const target = groups[0]!;
          const groupPosition = await nextGroupPosition(tx, target.id);
          await tx.team.update({ where: { id: team.id }, data: { groupId: target.id, groupPosition } });
          target.count += 1;
          assigned += 1;
        }
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "UNGROUPED_TEAMS_AUTO_DISTRIBUTED", entityType: "Division", entityId: divisionId, afterState: { assignedTeams: assigned } });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: `${assigned} ungrouped teams distributed across groups.` }), 303);
    }

    if (action === "configure-quarterfinal-seeds") {
      const divisionId = text(data.divisionId, "Division ID");
      const division = await prisma.division.findUnique({
        where: { id: divisionId },
        include: { groups: { select: { id: true, name: true } } },
      });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      if (division.formatType !== "GROUP_KNOCKOUT") throw new Error("Quarterfinal seed mapping is available for group-to-knockout divisions.");
      if (!division.autoProgression) throw new Error("Enable Auto progression before using standings-based Quarterfinal seed mapping.");
      const expectedQualifiers = division.groups.length * Math.max(0, division.qualifiersPerGroup) + Math.max(0, division.wildcardCount);
      if (expectedQualifiers !== 8) throw new Error(`Configure exactly 8 qualifiers before using the Quarterfinal seed map. Current total: ${expectedQualifiers}.`);

      const allowed = new Set(qualificationSourceOptions(division.groups, division.qualifiersPerGroup, division.wildcardCount).map((option) => option.value));
      const requested = Array.from({ length: 4 }, (_, index) => ({
        home: text(data[`qf-${index + 1}-home`], `Quarterfinal ${index + 1} top seed`, 160),
        away: text(data[`qf-${index + 1}-away`], `Quarterfinal ${index + 1} bottom seed`, 160),
      }));
      const sourceValues = requested.flatMap((slot) => [slot.home, slot.away]);
      if (sourceValues.some((value) => !allowed.has(value))) throw new Error("One or more Quarterfinal seed sources is no longer valid for this division.");
      if (new Set(sourceValues).size !== sourceValues.length) throw new Error("Each Quarterfinal seed source can only be used once.");

      const existing = await prisma.matchup.findMany({ where: { tournamentId: tournament.id, divisionId, stage: "QUARTERFINAL" }, include: { games: true }, orderBy: { order: "asc" } });
      if (existing.length > 4) throw new Error("This division has more than four Quarterfinal matchups. Remove extra future QFs before using the 8-team seed map.");
      if (existing.some(matchupHasRecordedPlay)) throw new Error("Quarterfinal seed mapping is locked because QF play has already started.");

      await prisma.$transaction(async (tx) => {
        const rows = [...existing];
        const maxOrder = await tx.matchup.aggregate({ where: { divisionId, stage: "QUARTERFINAL" }, _max: { order: true } });
        let nextOrder = (maxOrder._max.order ?? 0) + 1;
        while (rows.length < 4) {
          const sequence = rows.length + 1;
          rows.push(await tx.matchup.create({
            data: {
              tournamentId: tournament.id,
              divisionId,
              stage: "QUARTERFINAL",
              roundLabel: `Quarterfinal ${sequence}`,
              roundNumber: 1,
              order: nextOrder++,
              gamesPerMatchup: gamesForStage(division, "QUARTERFINAL"),
              status: "SCHEDULED",
            },
            include: { games: true },
          }));
        }
        for (let index = 0; index < 4; index += 1) {
          const row = rows[index]!;
          await tx.game.deleteMany({ where: { matchupId: row.id } });
          await tx.lineup.deleteMany({ where: { matchupId: row.id } });
          await tx.matchup.update({
            where: { id: row.id },
            data: {
              homeQualificationSource: requested[index]!.home,
              awayQualificationSource: requested[index]!.away,
              homeTeamId: null,
              awayTeamId: null,
              status: "SCHEDULED",
              homeWins: 0,
              awayWins: 0,
              winnerTeamId: null,
              queuePosition: null,
              courtLabel: null,
              scheduledAt: null,
              version: { increment: 1 },
            },
          });
        }
        await recalculateTournament(tx, tournament.id, { actorId: user.id, reason: "Quarterfinal seed map updated" });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "QUARTERFINAL_SEED_MAP_UPDATED", entityType: "Division", entityId: divisionId, afterState: { sources: requested } });
      }, TOURNAMENT_TRANSACTION_OPTIONS);
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: "Quarterfinal bracket map saved." }), 303);
    }

    if (action === "generate-all-group-round-robins") {
      const divisionId = text(data.divisionId, "Division ID");
      const division = await prisma.division.findUnique({
        where: { id: divisionId },
        include: { groups: { include: { teams: { orderBy: [{ groupPosition: "asc" }, { shortName: "asc" }, { name: "asc" }] } }, orderBy: { name: "asc" } } },
      });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      if (!division.groups.length) throw new Error("Create groups before generating group matchups.");
      const existing = await prisma.matchup.findMany({ where: { tournamentId: tournament.id, divisionId, stage: "GROUP" }, include: { games: true } });
      if (existing.some(matchupHasRecordedPlay)) throw new Error("This division already has group matchups with recorded play. Edit future matchups individually.");

      let created = 0;
      await prisma.$transaction(async (tx) => {
        const existingIds = existing.map((matchup) => matchup.id);
        if (existingIds.length) {
          await tx.game.deleteMany({ where: { matchupId: { in: existingIds } } });
          await tx.lineup.deleteMany({ where: { matchupId: { in: existingIds } } });
          await tx.matchup.deleteMany({ where: { id: { in: existingIds } } });
        }
        let order = 1;
        for (const group of division.groups) {
          if (group.teams.length < 2) continue;
          for (let homeIndex = 0; homeIndex < group.teams.length; homeIndex += 1) {
            for (let awayIndex = homeIndex + 1; awayIndex < group.teams.length; awayIndex += 1) {
              await tx.matchup.create({
                data: {
                  tournamentId: tournament.id,
                  divisionId,
                  stage: "GROUP",
                  groupLabel: group.name,
                  roundLabel: `${group.name} Match ${created + 1}`,
                  roundNumber: order,
                  order,
                  gamesPerMatchup: division.defaultGamesPerMatchup,
                  homeTeamId: group.teams[homeIndex]!.id,
                  awayTeamId: group.teams[awayIndex]!.id,
                  status: "LINEUP_PENDING",
                },
              });
              order += 1;
              created += 1;
            }
          }
        }
        await compactTournamentQueue(tx, tournament.id);
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "DIVISION_GROUP_ROUND_ROBINS_GENERATED", entityType: "Division", entityId: divisionId, afterState: { groupCount: division.groups.length, matchupCount: created } });
      });
      if (division.entrantType === "PAIR") await preparePairEntrantDivision(prisma, divisionId);
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: created ? `${created} group round-robin matchups generated.` : "No group had enough teams to generate matchups." }), 303);
    }

    if (action === "clear-unplayed-group-matchups") {
      const divisionId = text(data.divisionId, "Division ID");
      const division = await prisma.division.findUnique({ where: { id: divisionId } });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      const existing = await prisma.matchup.findMany({ where: { tournamentId: tournament.id, divisionId, stage: "GROUP" }, include: { games: true } });
      if (existing.some(matchupHasRecordedPlay)) throw new Error("This division has group matchups with recorded play. Only unplayed group matchups can be bulk-cleared.");
      const ids = existing.map((matchup) => matchup.id);
      await prisma.$transaction(async (tx) => {
        if (ids.length) {
          await tx.game.deleteMany({ where: { matchupId: { in: ids } } });
          await tx.lineup.deleteMany({ where: { matchupId: { in: ids } } });
          await tx.matchup.deleteMany({ where: { id: { in: ids } } });
        }
        await compactTournamentQueue(tx, tournament.id);
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "UNPLAYED_GROUP_MATCHUPS_CLEARED", entityType: "Division", entityId: divisionId, beforeState: { matchupCount: ids.length } });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: ids.length ? `${ids.length} unplayed group matchups cleared.` : "No group matchups to clear." }), 303);
    }

    if (action === "generate-round-robin") {
      const divisionId = text(data.divisionId, "Division ID");
      const groupId = optionalText(data.groupId);
      const division = await prisma.division.findUnique({ where: { id: divisionId } });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      const group = groupId ? await prisma.group.findUnique({ where: { id: groupId } }) : null;
      if (groupId && (!group || group.divisionId !== divisionId)) throw new Error("Invalid group.");
      const teams = await prisma.team.findMany({ where: { divisionId, ...(groupId ? { groupId } : {}) }, orderBy: [{ groupPosition: "asc" }, { shortName: "asc" }, { name: "asc" }] });
      if (teams.length < 2) throw new Error("At least two teams are required.");
      const targetStage = groupId ? "GROUP" : "ROUND_ROBIN";
      const scope = { divisionId, stage: targetStage as "GROUP" | "ROUND_ROBIN", ...(group ? { groupLabel: group.name } : { groupLabel: null }) };
      const existing = await prisma.matchup.findMany({ where: scope, include: { games: true } });
      if (existing.some((matchup) => matchup.status === "COMPLETED" || matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore || game.awayScore))) throw new Error("These matchups already have recorded play. Create/edit future matchups individually instead of regenerating them.");
      await prisma.$transaction(async (tx) => {
        await tx.matchup.deleteMany({ where: scope });
        const maxOrder = await tx.matchup.aggregate({ where: { divisionId, stage: targetStage }, _max: { order: true } });
        let order = (maxOrder._max.order ?? 0) + 1;
        for (let homeIndex = 0; homeIndex < teams.length; homeIndex += 1) {
          for (let awayIndex = homeIndex + 1; awayIndex < teams.length; awayIndex += 1) {
            await tx.matchup.create({
              data: {
                tournamentId: tournament.id,
                divisionId,
                stage: targetStage,
                groupLabel: group?.name ?? null,
                roundLabel: `Match ${order}`,
                roundNumber: order,
                order,
                gamesPerMatchup: division.defaultGamesPerMatchup,
                homeTeamId: teams[homeIndex]!.id,
                awayTeamId: teams[awayIndex]!.id,
                status: "LINEUP_PENDING",
              },
            });
            order += 1;
          }
        }
        await compactTournamentQueue(tx, tournament.id);
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "ROUND_ROBIN_REGENERATED", entityType: group ? "Group" : "Division", entityId: group?.id ?? divisionId, afterState: { teamCount: teams.length, matchupCount: (teams.length * (teams.length - 1)) / 2 } });
      });
      if (division.entrantType === "PAIR") await preparePairEntrantDivision(prisma, divisionId);
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: "Round-robin matchups generated." }), 303);
    }

    if (action === "update-active-courts") {
      const activeCourtCount = number(data.activeCourtCount, "Number of courts", 1, 20);
      const queued = await prisma.matchup.findMany({ where: { tournamentId: tournament.id, queuePosition: { not: null } }, select: { courtLabel: true } });
      const invalidQueuedCourt = queued.find((matchup) => {
        const court = Number(matchup.courtLabel);
        return Number.isInteger(court) && court > activeCourtCount;
      });
      if (invalidQueuedCourt) throw new Error("Move or remove queued matchups assigned to higher-numbered courts before reducing the court count.");
      await prisma.tournament.update({ where: { id: tournament.id }, data: { activeCourtCount } });
      return queueMutationResponse(request, tournament.id, `${activeCourtCount} active court${activeCourtCount === 1 ? "" : "s"} set.`);
    }

    if (action === "queue-matchup") {
      if (tournament.activeCourtCount < 1) throw new Error("Set the number of active courts first.");
      const matchupId = text(data.matchupId, "Matchup ID");
      const courtNumber = number(data.courtNumber, "Court", 1, tournament.activeCourtCount);
      const matchup = await prisma.matchup.findUnique({ where: { id: matchupId }, include: { games: true } });
      if (!matchup || matchup.tournamentId !== tournament.id) throw new Error("Matchup not found.");
      if (!matchup.homeTeamId || !matchup.awayTeamId) throw new Error("Assign both teams before adding this matchup to the queue.");
      if (matchupHasRecordedPlay(matchup)) throw new Error("A started or completed matchup cannot be newly queued.");
      if (matchup.queuePosition !== null) throw new Error("This matchup is already in the queue.");
      await prisma.$transaction(async (tx) => {
        await compactTournamentQueue(tx, tournament.id);
        const max = await tx.matchup.aggregate({ where: { tournamentId: tournament.id, queuePosition: { not: null } }, _max: { queuePosition: true } });
        await tx.matchup.update({ where: { id: matchupId }, data: { queuePosition: (max._max.queuePosition ?? 0) + 1, courtLabel: String(courtNumber), scheduledAt: null } });
      }, TOURNAMENT_TRANSACTION_OPTIONS);
      return queueMutationResponse(request, tournament.id, `${matchup.roundLabel} added to Court ${courtNumber}.`);
    }

    if (action === "update-queue-court") {
      if (tournament.activeCourtCount < 1) throw new Error("Set the number of active courts first.");
      const matchupId = text(data.matchupId, "Matchup ID");
      const courtNumber = number(data.courtNumber, "Court", 1, tournament.activeCourtCount);
      const matchup = await prisma.matchup.findUnique({ where: { id: matchupId } });
      if (!matchup || matchup.tournamentId !== tournament.id || matchup.queuePosition === null) throw new Error("Queued matchup not found.");
      await prisma.matchup.update({ where: { id: matchupId }, data: { courtLabel: String(courtNumber) } });
      return queueMutationResponse(request, tournament.id, `Matchup moved to Court ${courtNumber}.`);
    }

    if (action === "unqueue-matchup") {
      const matchupId = text(data.matchupId, "Matchup ID");
      const matchup = await prisma.matchup.findUnique({ where: { id: matchupId }, include: { games: true } });
      if (!matchup || matchup.tournamentId !== tournament.id) throw new Error("Matchup not found.");
      if (matchupHasRecordedPlay(matchup)) throw new Error("A started matchup stays tied to its assigned court.");
      await prisma.$transaction(async (tx) => {
        await tx.matchup.update({ where: { id: matchupId }, data: { queuePosition: null, courtLabel: null, scheduledAt: null } });
        await compactTournamentQueue(tx, tournament.id);
      }, TOURNAMENT_TRANSACTION_OPTIONS);
      return queueMutationResponse(request, tournament.id, "Matchup removed from the court queue.");
    }

    if (action === "move-queue-item") {
      const matchupId = text(data.matchupId, "Matchup ID");
      const direction = String(data.direction || "");
      if (!['up', 'down'].includes(direction)) throw new Error("Invalid queue direction.");
      const current = await prisma.matchup.findUnique({ where: { id: matchupId }, include: { games: true } });
      if (!current || current.tournamentId !== tournament.id || current.queuePosition === null) throw new Error("Queued matchup not found.");
      if (matchupHasRecordedPlay(current)) throw new Error("A matchup already in progress cannot be reordered.");
      const neighbor = await prisma.matchup.findFirst({
        where: { tournamentId: tournament.id, queuePosition: direction === "up" ? { lt: current.queuePosition } : { gt: current.queuePosition } },
        include: { games: true },
        orderBy: { queuePosition: direction === "up" ? "desc" : "asc" },
      });
      if (neighbor && matchupHasRecordedPlay(neighbor)) {
        throw new Error("A future matchup cannot be reordered across a matchup already in progress.");
      }
      if (neighbor?.queuePosition !== null && neighbor?.queuePosition !== undefined) {
        await prisma.$transaction([
          prisma.matchup.update({ where: { id: current.id }, data: { queuePosition: neighbor.queuePosition } }),
          prisma.matchup.update({ where: { id: neighbor.id }, data: { queuePosition: current.queuePosition } }),
        ]);
      }
      return queueMutationResponse(request, tournament.id, "Queue order updated.");
    }

    if (action === "create-matchup") {
      const divisionId = text(data.divisionId, "Division ID");
      const division = await prisma.division.findUnique({ where: { id: divisionId } });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      const homeTeamId = optionalText(data.homeTeamId);
      const awayTeamId = optionalText(data.awayTeamId);
      if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) throw new Error("Select two different teams.");
      const teamIds = [homeTeamId, awayTeamId].filter(Boolean) as string[];
      if (teamIds.length) {
        const count = await prisma.team.count({ where: { id: { in: teamIds }, divisionId } });
        if (count !== teamIds.length) throw new Error("Both teams must belong to the selected division.");
      }
      const matchupStage = stage(data.stage || "CUSTOM");
      const orderAgg = await prisma.matchup.aggregate({ where: { divisionId, stage: matchupStage }, _max: { order: true } });
      const defaultGames = gamesForStage(division, matchupStage);
      const requestedGames = division.entrantType === "PAIR" ? 1 : number(data.gamesPerMatchup || defaultGames, "Matches per matchup", 1, 31);
      const matchup = await prisma.matchup.create({
        data: {
          tournamentId: tournament.id,
          divisionId,
          stage: matchupStage,
          groupLabel: optionalText(data.groupLabel, 80),
          roundLabel: text(data.roundLabel, "Round label", 80),
          order: (orderAgg._max.order ?? 0) + 1,
          gamesPerMatchup: requestedGames,
          homeTeamId,
          awayTeamId,
          status: homeTeamId && awayTeamId ? "LINEUP_PENDING" : "SCHEDULED",
          scheduledAt: null,
          courtLabel: null,
        },
      });
      if (division.entrantType === "PAIR") await preparePairEntrantMatchup(prisma, matchup.id);
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: `${matchup.roundLabel} created.` }), 303);
    }

    if (action === "update-matchup") {
      const matchupId = text(data.matchupId, "Matchup ID");
      const before = await prisma.matchup.findUnique({ where: { id: matchupId }, include: { division: true } });
      if (!before || before.tournamentId !== tournament.id) throw new Error("Matchup not found.");
      const hasStarted = await started(matchupId);
      const base = { roundLabel: text(data.roundLabel, "Round label", 80) };
      if (hasStarted) {
        await prisma.matchup.update({ where: { id: matchupId }, data: base });
      } else {
        const divisionId = text(data.divisionId, "Division ID");
        const division = await prisma.division.findUnique({ where: { id: divisionId } });
        if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
        const homeTeamId = optionalText(data.homeTeamId);
        const awayTeamId = optionalText(data.awayTeamId);
        const requestedStage = stage(data.stage);
        const competitorsChanged = homeTeamId !== before.homeTeamId || awayTeamId !== before.awayTeamId;
        if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) throw new Error("Select two different teams.");
        const teamIds = [homeTeamId, awayTeamId].filter(Boolean) as string[];
        const count = await prisma.team.count({ where: { id: { in: teamIds }, divisionId } });
        if (count !== teamIds.length) throw new Error("Assigned teams must belong to the selected division.");
        await prisma.$transaction(async (tx) => {
          await tx.game.deleteMany({ where: { matchupId } });
          await tx.lineup.deleteMany({ where: { matchupId } });
          await tx.matchup.update({
            where: { id: matchupId },
            data: {
              ...base,
              divisionId,
              stage: requestedStage,
              groupLabel: optionalText(data.groupLabel, 80),
              gamesPerMatchup: division.entrantType === "PAIR" ? 1 : number(data.gamesPerMatchup, "Matches per matchup", 1, 31),
              homeTeamId,
              awayTeamId,
              status: homeTeamId && awayTeamId ? "LINEUP_PENDING" : "SCHEDULED",
              homeWins: 0,
              awayWins: 0,
              winnerTeamId: null,
              ...((before.stage === "QUARTERFINAL" && (requestedStage !== "QUARTERFINAL" || competitorsChanged)) ? { homeQualificationSource: null, awayQualificationSource: null } : {}),
              ...(!homeTeamId || !awayTeamId ? { queuePosition: null, courtLabel: null, scheduledAt: null } : {}),
              version: { increment: 1 },
            },
          });
          await compactTournamentQueue(tx, tournament.id);
        });
        if (division.entrantType === "PAIR") await preparePairEntrantMatchup(prisma, matchupId);
      }
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: hasStarted ? "Live/completed matchup metadata updated; competitors and match structure were preserved." : "Future matchup updated." }), 303);
    }

    if (action === "bulk-update-matchup-schedule") {
      const divisionId = text(data.divisionId, "Division ID");
      const division = await prisma.division.findUnique({ where: { id: divisionId } });
      if (!division || division.tournamentId !== tournament.id) throw new Error("Division not found.");
      const matchupIds = Array.isArray(data.matchupIds) ? data.matchupIds.map((value) => String(value)) : [String(data.matchupIds || "")].filter(Boolean);
      if (!matchupIds.length) throw new Error("No matchups selected.");
      const matchups = await prisma.matchup.findMany({
        where: { id: { in: matchupIds }, tournamentId: tournament.id, divisionId },
        include: { games: true },
      });
      if (matchups.length !== matchupIds.length) throw new Error("One or more matchups does not belong to this division.");

      let updated = 0;
      await prisma.$transaction(async (tx) => {
        for (const matchup of matchups) {
          const isStarted = matchupHasRecordedPlay(matchup);
          const key = matchup.id;
          const base = {
            roundLabel: text(data[`roundLabel-${key}`], "Round label", 80),
          };
          const requestedGames = isStarted ? matchup.gamesPerMatchup : (division.entrantType === "PAIR" ? 1 : number(data[`gamesPerMatchup-${key}`] || matchup.gamesPerMatchup, "Matches per matchup", 1, 31));
          if (!isStarted && requestedGames !== matchup.gamesPerMatchup) {
            await tx.game.deleteMany({ where: { matchupId: matchup.id } });
            await tx.lineup.deleteMany({ where: { matchupId: matchup.id } });
          }
          await tx.matchup.update({
            where: { id: matchup.id },
            data: {
              ...base,
              ...(isStarted ? {} : {
                gamesPerMatchup: requestedGames,
                ...(requestedGames !== matchup.gamesPerMatchup ? { status: matchup.homeTeamId && matchup.awayTeamId ? "LINEUP_PENDING" : "SCHEDULED", homeWins: 0, awayWins: 0, winnerTeamId: null, version: { increment: 1 } } : {}),
              }),
            },
          });
          updated += 1;
        }
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "MATCHUP_STRUCTURE_BULK_UPDATED", entityType: "Division", entityId: divisionId, afterState: { matchupCount: updated } });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: `${updated} matchup rows saved.` }), 303);
    }

    if (action === "delete-matchup") {
      const matchupId = text(data.matchupId, "Matchup ID");
      const matchup = await prisma.matchup.findUnique({ where: { id: matchupId } });
      if (!matchup || matchup.tournamentId !== tournament.id) throw new Error("Matchup not found.");
      if (await started(matchupId)) throw new Error("A started/completed matchup cannot be deleted.");
      await prisma.$transaction(async (tx) => {
        await tx.matchup.delete({ where: { id: matchupId } });
        await compactTournamentQueue(tx, tournament.id);
      }, TOURNAMENT_TRANSACTION_OPTIONS);
      return NextResponse.redirect(redirectBack(request, "/admin/tournament", { success: "Future matchup deleted." }), 303);
    }

    throw new Error("Unsupported tournament structure action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tournament update failed.";
    if (request.headers.get("x-tournament-queue") === "1" || request.headers.get("x-group-assignment") === "1") {
      return NextResponse.json({ ok: false, message }, { status: 400 });
    }
    return NextResponse.redirect(redirectBack(request, "/admin/tournament", { error: message }), 303);
  }
}
