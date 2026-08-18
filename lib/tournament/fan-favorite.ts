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
  team: { id: string; name: string; shortName: string } | null;
};

export type FanFavoritePublicRanking = {
  rank: number;
  votes: number;
  percentage: number;
  player?: FanFavoritePublicPlayer;
};

export type FanFavoriteTeamSupport = {
  team: { id: string; name: string; shortName: string };
  votes: number;
  percentage: number;
  maleVotes: number;
  femaleVotes: number;
};

export type FanFavoritePublicSnapshot = {
  votingOpen: boolean;
  votingDeadline: string | null;
  totalVotes: number;
  totalsBySex: { male: number; female: number };
  rankingsBySex: { male: FanFavoritePublicRanking[]; female: FanFavoritePublicRanking[] };
  teamSupport: FanFavoriteTeamSupport[];
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
  team: { select: { id: true, name: true, shortName: true } },
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

  const players = await prisma.player.findMany({
    where: {
      tournamentId,
      isActive: true,
      participationStatus: "CONFIRMED",
      teamId: { not: null },
      team: { division: { isPublic: true } },
    },
    select: playerSelect,
  });

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

  const totalVotes = maleTotal + femaleTotal;
  const teamSupportMap = new Map<string, FanFavoriteTeamSupport>();
  for (const player of players) {
    if (!player.team || teamSupportMap.has(player.team.id)) continue;
    teamSupportMap.set(player.team.id, { team: player.team, votes: 0, percentage: 0, maleVotes: 0, femaleVotes: 0 });
  }
  for (const row of publicGrouped) {
    const player = playerById.get(row.playerId);
    if (!player?.team) continue;
    const existing = teamSupportMap.get(player.team.id) ?? {
      team: player.team,
      votes: 0,
      percentage: 0,
      maleVotes: 0,
      femaleVotes: 0,
    };
    existing.votes += row._count._all;
    if (row.sexCategory === "MALE") existing.maleVotes += row._count._all;
    if (row.sexCategory === "FEMALE") existing.femaleVotes += row._count._all;
    teamSupportMap.set(player.team.id, existing);
  }
  const teamSupport = Array.from(teamSupportMap.values())
    .map((row) => ({ ...row, percentage: totalVotes ? Math.round((row.votes / totalVotes) * 1000) / 10 : 0 }))
    .sort((a, b) => b.votes - a.votes || a.team.shortName.localeCompare(b.team.shortName));

  return {
    votingOpen: Boolean(tournament?.votingOpen && (!tournament.votingDeadline || tournament.votingDeadline > new Date())),
    votingDeadline: tournament?.votingDeadline?.toISOString() ?? null,
    totalVotes,
    totalsBySex: { male: maleTotal, female: femaleTotal },
    rankingsBySex: {
      male: rankingsFor("MALE", maleTotal),
      female: rankingsFor("FEMALE", femaleTotal),
    },
    teamSupport,
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
