import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

function hasRecordedPlay(game: { status: string; homeScore: number; awayScore: number }) {
  return game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0;
}

/**
 * PAIR divisions reuse the battle-tested Team/Pair/Game storage internally, but the event entrant
 * is the fixed pair itself. This helper removes the Team Event lineup step: once two pair entrants
 * are assigned, slot 1 and the single scoreable match are prepared automatically.
 */
export async function preparePairEntrantMatchup(db: DbClient, matchupId: string) {
  const matchup = await db.matchup.findUnique({
    where: { id: matchupId },
    include: {
      division: { select: { entrantType: true } },
      games: true,
      lineups: { include: { slots: true } },
      homeTeam: { include: { pairs: { where: { isActive: true }, orderBy: { label: "asc" } } } },
      awayTeam: { include: { pairs: { where: { isActive: true }, orderBy: { label: "asc" } } } },
    },
  });
  if (!matchup || matchup.division.entrantType !== "PAIR") return null;
  if (matchup.games.some(hasRecordedPlay)) return matchup;
  if (matchup.gamesPerMatchup !== 1) throw new Error("Executive pair matchups must contain exactly one match.");

  if (!matchup.homeTeamId || !matchup.awayTeamId) {
    if (matchup.games.length) await db.game.deleteMany({ where: { matchupId } });
    if (matchup.lineups.length) await db.lineup.deleteMany({ where: { matchupId } });
    await db.matchup.update({ where: { id: matchupId }, data: { status: "SCHEDULED", homeWins: 0, awayWins: 0, winnerTeamId: null, version: { increment: 1 } } });
    return null;
  }

  const homePairs = matchup.homeTeam?.pairs ?? [];
  const awayPairs = matchup.awayTeam?.pairs ?? [];
  if (homePairs.length !== 1 || awayPairs.length !== 1) {
    throw new Error("Each Executive entrant must have exactly one active fixed pair before it can be scheduled.");
  }

  const existingHome = matchup.lineups.find((lineup) => lineup.teamId === matchup.homeTeamId);
  const existingAway = matchup.lineups.find((lineup) => lineup.teamId === matchup.awayTeamId);
  const existingGame = matchup.games[0];
  const alreadyPrepared = matchup.games.length === 1
    && matchup.lineups.length === 2
    && existingHome?.slots.length === 1
    && existingHome.slots[0]?.pairId === homePairs[0]!.id
    && existingAway?.slots.length === 1
    && existingAway.slots[0]?.pairId === awayPairs[0]!.id
    && existingGame?.homePairId === homePairs[0]!.id
    && existingGame?.awayPairId === awayPairs[0]!.id
    && existingGame.homeTeamId === matchup.homeTeamId
    && existingGame.awayTeamId === matchup.awayTeamId;
  if (alreadyPrepared) {
    if (matchup.status !== "READY") await db.matchup.update({ where: { id: matchupId }, data: { status: "READY", version: { increment: 1 } } });
    return matchup;
  }

  await db.game.deleteMany({ where: { matchupId } });
  await db.lineup.deleteMany({ where: { matchupId } });
  await db.lineup.create({ data: { matchupId, teamId: matchup.homeTeamId, slots: { create: [{ slot: 1, pairId: homePairs[0]!.id }] } } });
  await db.lineup.create({ data: { matchupId, teamId: matchup.awayTeamId, slots: { create: [{ slot: 1, pairId: awayPairs[0]!.id }] } } });
  await db.game.create({
    data: {
      matchupId,
      gameNumber: 1,
      homeTeamId: matchup.homeTeamId,
      awayTeamId: matchup.awayTeamId,
      homePairId: homePairs[0]!.id,
      awayPairId: awayPairs[0]!.id,
      status: "SCHEDULED",
    },
  });
  await db.matchup.update({ where: { id: matchupId }, data: { status: "READY", homeWins: 0, awayWins: 0, winnerTeamId: null, version: { increment: 1 } } });
  return db.matchup.findUnique({ where: { id: matchupId } });
}

export async function preparePairEntrantDivision(db: DbClient, divisionId: string) {
  const rows = await db.matchup.findMany({ where: { divisionId }, select: { id: true } });
  for (const row of rows) await preparePairEntrantMatchup(db, row.id);
}
