import { NextResponse } from "next/server";
import type { SexCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  if (!tournament) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });

  const grouped = await prisma.fanVote.groupBy({
    by: ["playerId", "sexCategory"],
    where: { tournamentId: tournament.id },
    _count: { _all: true },
    orderBy: [{ sexCategory: "asc" }, { _count: { playerId: "desc" } }, { playerId: "asc" }],
  });
  const players = await prisma.player.findMany({
    where: { id: { in: grouped.map((row) => row.playerId) }, isActive: true, participationStatus: "CONFIRMED", team: { division: { isPublic: true } } },
    include: { team: true },
  });
  const playerById = new Map(players.map((player) => [player.id, player]));
  const publicGrouped = grouped.filter((row) => playerById.has(row.playerId));
  const totalVotes = publicGrouped.reduce((sum, row) => sum + row._count._all, 0);
  const totalsBySex = {
    male: publicGrouped.filter((row) => row.sexCategory === "MALE").reduce((sum, row) => sum + row._count._all, 0),
    female: publicGrouped.filter((row) => row.sexCategory === "FEMALE").reduce((sum, row) => sum + row._count._all, 0),
  };

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
  const rankingsBySex = {
    male: rankingsFor("MALE", totalsBySex.male),
    female: rankingsFor("FEMALE", totalsBySex.female),
  };

  return NextResponse.json({
    tournamentId: tournament.id,
    votingOpen: tournament.votingOpen && (!tournament.votingDeadline || tournament.votingDeadline > new Date()),
    votingDeadline: tournament.votingDeadline,
    totalVotes,
    totalsBySex,
    rankingsBySex,
    rankings: [...rankingsBySex.male, ...rankingsBySex.female],
    updatedAt: new Date().toISOString(),
  });
}
