import { prisma } from "@/lib/prisma";

export async function getPublicTournamentRevision(tournamentId: string) {
  const latest = await prisma.matchup.findFirst({
    where: { tournamentId, division: { isPublic: true } },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  return `${tournamentId}:${latest?.updatedAt.getTime() ?? 0}`;
}
