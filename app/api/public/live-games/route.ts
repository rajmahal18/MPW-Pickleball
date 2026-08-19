import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPublishedTournamentId } from "@/lib/tournament/public-tournament";

export const dynamic = "force-dynamic";

const publicPlayerSelect = {
  id: true,
  firstName: true,
  middleInitial: true,
  lastName: true,
  displayName: true,
  avatarUrl: true,
} as const;
const publicTeamSelect = { id: true, name: true, shortName: true, logoUrl: true, brandingPrimary: true, brandingSecondary: true, brandingAccent: true, brandingText: true, brandingSurface: true } as const;

const LIVE_CACHE_TTL_MS = 1_000;
let liveCache: { tournamentId: string; expiresAt: number; value: unknown[] } | null = null;
let liveInflight: { tournamentId: string; promise: Promise<unknown[]> } | null = null;

async function loadLiveGames(tournamentId: string) {
  const now = Date.now();
  if (liveCache?.tournamentId === tournamentId && liveCache.expiresAt > now) return liveCache.value;
  if (liveInflight?.tournamentId === tournamentId) return liveInflight.promise;

  const promise = prisma.game.findMany({
    where: { status: { in: ["LIVE", "INTERRUPTED"] }, matchup: { tournamentId, division: { isPublic: true } } },
    select: {
      id: true, matchupId: true, gameNumber: true, homeScore: true, awayScore: true, status: true, winnerTeamId: true,
      matchup: { select: { courtLabel: true, roundLabel: true } },
      homeTeam: { select: publicTeamSelect },
      awayTeam: { select: publicTeamSelect },
      homePair: { select: { id: true, playerA: { select: publicPlayerSelect }, playerB: { select: publicPlayerSelect } } },
      awayPair: { select: { id: true, playerA: { select: publicPlayerSelect }, playerB: { select: publicPlayerSelect } } },
    },
    orderBy: [{ startedAt: { sort: "desc", nulls: "last" } }, { gameNumber: "asc" }],
  }).then((games) => {
    liveCache = { tournamentId, expiresAt: Date.now() + LIVE_CACHE_TTL_MS, value: games };
    return games;
  }).finally(() => {
    if (liveInflight?.promise === promise) liveInflight = null;
  });

  liveInflight = { tournamentId, promise };
  return promise;
}

export async function GET() {
  const tournamentId = await getPublishedTournamentId();
  if (!tournamentId) return NextResponse.json([]);
  return NextResponse.json(await loadLiveGames(tournamentId), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
