import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicDivisionFilter } from "@/lib/public-preview";

export const dynamic = "force-dynamic";

const publicPlayerSelect = {
  id: true,
  firstName: true,
  middleInitial: true,
  lastName: true,
  displayName: true,
  avatarUrl: true,
} as const;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const divisionFilter = await publicDivisionFilter();
  const game = await prisma.game.findFirst({
    where: { id, matchup: { tournament: { isPublished: true }, division: divisionFilter } },
    select: {
      id: true,
      matchupId: true,
      gameNumber: true,
      homeScore: true,
      awayScore: true,
      status: true,
      winnerTeamId: true,
      matchup: { select: { courtLabel: true, roundLabel: true } },
      homeTeam: { select: { id: true, shortName: true } },
      awayTeam: { select: { id: true, shortName: true } },
      homePair: { select: { id: true, playerA: { select: publicPlayerSelect }, playerB: { select: publicPlayerSelect } } },
      awayPair: { select: { id: true, playerA: { select: publicPlayerSelect }, playerB: { select: publicPlayerSelect } } },
    },
  });
  return game ? NextResponse.json(game) : new NextResponse("Not found", { status: 404 });
}
