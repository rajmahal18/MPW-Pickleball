import type { Prisma } from "@prisma/client";
import { computeStandings, selectQualifiers } from "@/lib/tournament/standings";
import { writeAudit } from "@/lib/audit";

async function clearDependentMatchup(db: Prisma.TransactionClient, matchupId: string) {
  await db.game.deleteMany({ where: { matchupId } });
  await db.lineup.deleteMany({ where: { matchupId } });
  await db.matchup.update({
    where: { id: matchupId },
    data: {
      status: "LINEUP_PENDING",
      homeWins: 0,
      awayWins: 0,
      winnerTeamId: null,
      version: { increment: 1 },
    },
  });
}

async function assignTeams(
  db: Prisma.TransactionClient,
  matchupId: string,
  homeTeamId: string | null,
  awayTeamId: string | null,
) {
  const current = await db.matchup.findUnique({ where: { id: matchupId } });
  if (!current) return;
  const changed = current.homeTeamId !== homeTeamId || current.awayTeamId !== awayTeamId;
  if (!changed) return;
  await clearDependentMatchup(db, matchupId);
  await db.matchup.update({
    where: { id: matchupId },
    data: {
      homeTeamId,
      awayTeamId,
      status: homeTeamId && awayTeamId ? "LINEUP_PENDING" : "SCHEDULED",
      homeWins: 0,
      awayWins: 0,
      winnerTeamId: null,
    },
  });
}


async function ensureKnockoutMatchup(
  db: Prisma.TransactionClient,
  tournamentId: string,
  stage: "SEMIFINAL" | "FINAL",
  order: number,
  roundLabel: string,
  roundNumber: number,
) {
  const existing = await db.matchup.findFirst({ where: { tournamentId, stage, order } });
  if (existing) return existing;
  return db.matchup.create({
    data: {
      tournamentId,
      stage,
      roundLabel,
      roundNumber,
      order,
      status: "SCHEDULED",
    },
  });
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
  const complete = matchup.games.length === 7 && decidedGames.length === 7;
  const hasLiveGame = matchup.games.some((game) => game.status === "LIVE" || game.status === "INTERRUPTED");
  const status = complete
    ? "COMPLETED"
    : hasLiveGame || decidedGames.length > 0
      ? "LIVE"
      : matchup.lineups.length === 2 && matchup.games.length === 7
        ? "READY"
        : matchup.homeTeamId && matchup.awayTeamId
          ? "LINEUP_PENDING"
          : "SCHEDULED";
  const winnerTeamId = complete
    ? homeWins > awayWins
      ? matchup.homeTeamId
      : matchup.awayTeamId
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
  const matchups = await db.matchup.findMany({ where: { tournamentId }, select: { id: true } });
  for (const matchup of matchups) await recalculateMatchup(db, matchup.id);

  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      groups: { include: { teams: { include: { group: true } } }, orderBy: { name: "asc" } },
      matchups: { where: { stage: "GROUP" }, orderBy: { order: "asc" } },
    },
  });
  if (!tournament) throw new Error("Tournament not found.");

  const groupTables = tournament.groups.map((group) =>
    computeStandings(group.teams, tournament.matchups.filter((matchup) => matchup.groupLabel === group.name)),
  );
  const allGroupComplete =
    tournament.matchups.length > 0 && tournament.matchups.every((matchup) => matchup.status === "COMPLETED");

  const semifinalOne = await ensureKnockoutMatchup(db, tournamentId, "SEMIFINAL", 101, "Semifinal 1", 1);
  const semifinalTwo = await ensureKnockoutMatchup(db, tournamentId, "SEMIFINAL", 102, "Semifinal 2", 1);
  const final = await ensureKnockoutMatchup(db, tournamentId, "FINAL", 201, "Grand Final", 1);

  if (allGroupComplete) {
    const { wildcard, seededWinners } = selectQualifiers(groupTables);
    await assignTeams(db, semifinalOne.id, seededWinners[0]?.team.id ?? null, wildcard?.team.id ?? null);
    await assignTeams(
      db,
      semifinalTwo.id,
      seededWinners[1]?.team.id ?? null,
      seededWinners[2]?.team.id ?? null,
    );
  } else {
    await assignTeams(db, semifinalOne.id, null, null);
    await assignTeams(db, semifinalTwo.id, null, null);
  }

  const semifinals = await db.matchup.findMany({
    where: { tournamentId, stage: "SEMIFINAL" },
    orderBy: { order: "asc" },
  });
  const finalists = semifinals.map((matchup) => matchup.winnerTeamId).filter((value): value is string => Boolean(value));
  await assignTeams(db, final.id, finalists[0] ?? null, finalists[1] ?? null);

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
      afterState: {
        groupStageComplete: allGroupComplete,
        qualifiers: allGroupComplete
          ? selectQualifiers(groupTables).groupWinners.map((row) => row.team.id)
          : [],
      },
    });
  }

  return { groupTables, allGroupComplete };
}
