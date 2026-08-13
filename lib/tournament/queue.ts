import type { Prisma } from "@prisma/client";

/**
 * Keep the tournament-day queue dense (1, 2, 3, ...).
 * Queue positions are operational ordering only, so gaps should never leak
 * into public/admin labels after an item completes, is removed, or is regenerated.
 */
export async function compactTournamentQueue(db: Prisma.TransactionClient, tournamentId: string) {
  const queued = await db.matchup.findMany({
    where: { tournamentId, queuePosition: { not: null } },
    select: { id: true, queuePosition: true },
    orderBy: [{ queuePosition: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  for (const [index, matchup] of queued.entries()) {
    const desired = index + 1;
    if (matchup.queuePosition === desired) continue;
    await db.matchup.update({ where: { id: matchup.id }, data: { queuePosition: desired } });
  }

  return queued.length;
}
