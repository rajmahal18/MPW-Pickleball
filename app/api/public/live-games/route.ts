import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const publicPlayerSelect = {
  id: true,
  firstName: true,
  middleInitial: true,
  lastName: true,
  displayName: true,
  avatarUrl: true,
} as const;

export async function GET() {
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!tournament) return NextResponse.json([]);
  const games = await prisma.game.findMany({
    where: { status: { in: ["LIVE", "INTERRUPTED"] }, matchup: { tournamentId: tournament.id, division: { isPublic: true } } },
    select: {
      id: true, matchupId: true, gameNumber: true, homeScore: true, awayScore: true, status: true, winnerTeamId: true,
      matchup: { select: { courtLabel: true, roundLabel: true } },
      homeTeam: { select: { id: true, shortName: true } },
      awayTeam: { select: { id: true, shortName: true } },
      homePair: { select: { id: true, playerA: { select: publicPlayerSelect }, playerB: { select: publicPlayerSelect } } },
      awayPair: { select: { id: true, playerA: { select: publicPlayerSelect }, playerB: { select: publicPlayerSelect } } },
    },
    orderBy: [{ startedAt: { sort: "desc", nulls: "last" } }, { gameNumber: "asc" }],
  });
  return NextResponse.json(games);
}
