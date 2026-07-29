import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  if (!tournament) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });

  const grouped = await prisma.fanVote.groupBy({
    by: ["playerId"],
    where: { tournamentId: tournament.id },
    _count: { _all: true },
    orderBy: [{ _count: { playerId: "desc" } }, { playerId: "asc" }],
  });
  const players = await prisma.player.findMany({
    where: { id: { in: grouped.map((row) => row.playerId) } },
    include: { team: true },
  });
  const playerById = new Map(players.map((player) => [player.id, player]));
  const totalVotes = grouped.reduce((sum, row) => sum + row._count._all, 0);
  let previousVotes = -1;
  let currentRank = 0;
  const rankings = grouped.map((row, index) => {
    const votes = row._count._all;
    if (votes !== previousVotes) currentRank = index + 1;
    previousVotes = votes;
    return {
      rank: currentRank,
      votes,
      percentage: totalVotes ? Math.round((votes / totalVotes) * 1000) / 10 : 0,
      player: playerById.get(row.playerId),
    };
  });

  return NextResponse.json({
    tournamentId: tournament.id,
    votingOpen: tournament.votingOpen && (!tournament.votingDeadline || tournament.votingDeadline > new Date()),
    votingDeadline: tournament.votingDeadline,
    totalVotes,
    rankings,
    updatedAt: new Date().toISOString(),
  });
}
