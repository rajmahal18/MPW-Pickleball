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
const publicTeamSelect = { id: true, name: true, shortName: true, logoUrl: true, brandingPrimary: true, brandingSecondary: true, brandingAccent: true, brandingText: true, brandingSurface: true } as const;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchup = await prisma.matchup.findFirst({
    where: { id, division: { isPublic: true }, tournament: { isPublished: true } },
    select: {
      id: true,
      status: true,
      homeWins: true,
      awayWins: true,
      winnerTeamId: true,
      gamesPerMatchup: true,
      stage: true,
      division: { select: { suddenDeathAtTen: true } },
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: publicTeamSelect },
      awayTeam: { select: publicTeamSelect },
      games: {
        orderBy: { gameNumber: "asc" },
        select: {
          id: true,
          gameNumber: true,
          homeScore: true,
          awayScore: true,
          status: true,
          winnerTeamId: true,
          homeTeam: { select: publicTeamSelect },
          awayTeam: { select: publicTeamSelect },
          homePair: { select: { id: true, playerA: { select: publicPlayerSelect }, playerB: { select: publicPlayerSelect } } },
          awayPair: { select: { id: true, playerA: { select: publicPlayerSelect }, playerB: { select: publicPlayerSelect } } },
        },
      },
    },
  });
  if (!matchup) return new NextResponse("Not found", { status: 404 });
  const { division, ...publicMatchup } = matchup;
  return NextResponse.json({ ...publicMatchup, suddenDeathAtTen: division.suddenDeathAtTen });
}
