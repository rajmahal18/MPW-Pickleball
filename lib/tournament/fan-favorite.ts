import type { SexCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type FanFavoritePublicPlayer = {
  id: string;
  firstName: string;
  middleInitial: string | null;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  sex: SexCategory;
  team: { name: string; shortName: string } | null;
};

export type FanFavoritePublicRanking = {
  rank: number;
  votes: number;
  percentage: number;
  player?: FanFavoritePublicPlayer;
};

export type FanFavoritePublicSnapshot = {
  votingOpen: boolean;
  votingDeadline: string | null;
  totalVotes: number;
  totalsBySex: { male: number; female: number };
  rankingsBySex: { male: FanFavoritePublicRanking[]; female: FanFavoritePublicRanking[] };
  updatedAt: string;
};

const SNAPSHOT_TTL_MS = 1_500;
const snapshotCache = new Map<string, { expiresAt: number; value: FanFavoritePublicSnapshot }>();
const inflight = new Map<string, Promise<FanFavoritePublicSnapshot>>();

const playerSelect = {
  id: true,
  firstName: true,
  middleInitial: true,
  lastName: true,
  displayName: true,
  avatarUrl: true,
  sex: true,
  team: { select: { name: true, shortName: true } },
} as const;

async function loadFanFavoriteSnapshot(tournamentId: string): Promise<FanFavoritePublicSnapshot> {
  const [tournament, grouped] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { votingOpen: true, votingDeadline: true },
    }),
    prisma.fanVote.groupBy({
      by: ["playerId", "sexCategory"],
      where: { tournamentId },
      _count: { _all: true },
      orderBy: [{ sexCategory: "asc" }, { _count: { playerId: "desc" } }, { playerId: "asc" }],
    }),
  ]);

  const players = grouped.length ? await prisma.player.findMany({
    where: {
      id: { in: grouped.map((row) => row.playerId) },
      isActive: true,
      participationStatus: "CONFIRMED",
      team: { division: { isPublic: true } },
    },
    select: playerSelect,
  }) : [];

  const playerById = new Map(players.map((player) => [player.id, player]));
  const publicGrouped = grouped.filter((row) => playerById.has(row.playerId));
  const maleTotal = publicGrouped
    .filter((row) => row.sexCategory === "MALE")
    .reduce((sum, row) => sum + row._count._all, 0);
  const femaleTotal = publicGrouped
    .filter((row) => row.sexCategory === "FEMALE")
    .reduce((sum, row) => sum + row._count._all, 0);

  function rankingsFor(sexCategory: SexCategory, total: number) {
    let previousVotes = -1;
    let currentRank = 0;
    return publicGrouped
      .filter((row) => row.sexCategory === sexCategory)
      .map((row, index) => {
        const votes = row._count._all;
        if (votes !== previousVotes) currentRank = index + 1;
        previousVotes = votes;
        return {
          rank: currentRank,
          votes,
          percentage: total ? Math.round((votes / total) * 1000) / 10 : 0,
          player: playerById.get(row.playerId),
        };
      });
  }

  return {
    votingOpen: Boolean(tournament?.votingOpen && (!tournament.votingDeadline || tournament.votingDeadline > new Date())),
    votingDeadline: tournament?.votingDeadline?.toISOString() ?? null,
    totalVotes: maleTotal + femaleTotal,
    totalsBySex: { male: maleTotal, female: femaleTotal },
    rankingsBySex: {
      male: rankingsFor("MALE", maleTotal),
      female: rankingsFor("FEMALE", femaleTotal),
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function getFanFavoriteSnapshot(tournamentId: string, options?: { fresh?: boolean }) {
  const now = Date.now();
  const cached = snapshotCache.get(tournamentId);
  if (!options?.fresh && cached && cached.expiresAt > now) return cached.value;

  const pending = inflight.get(tournamentId);
  if (!options?.fresh && pending) return pending;

  const request = loadFanFavoriteSnapshot(tournamentId)
    .then((value) => {
      snapshotCache.set(tournamentId, { expiresAt: Date.now() + SNAPSHOT_TTL_MS, value });
      return value;
    })
    .finally(() => inflight.delete(tournamentId));

  inflight.set(tournamentId, request);
  return request;
}

export function invalidateFanFavoriteSnapshot(tournamentId?: string) {
  if (tournamentId) {
    snapshotCache.delete(tournamentId);
    inflight.delete(tournamentId);
    return;
  }
  snapshotCache.clear();
  inflight.clear();
}
