import { prisma } from "@/lib/prisma";
import { getPublishedTournamentId } from "@/lib/tournament/public-tournament";

const PUBLIC_REVISION_TTL_MS = 900;
let publicRevisionCache: { tournamentId: string; expiresAt: number; revision: string } | null = null;
let publicRevisionInflight: { tournamentId: string; promise: Promise<string> } | null = null;

export async function getPublicTournamentRevision(tournamentId: string) {
  const latest = await prisma.matchup.findFirst({
    where: { tournamentId, division: { isPublic: true } },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  return `${tournamentId}:${latest?.updatedAt.getTime() ?? 0}`;
}

export async function getLatestPublishedPublicTournamentRevision() {
  const tournamentId = await getPublishedTournamentId();
  if (!tournamentId) return "none:0";

  const now = Date.now();
  if (publicRevisionCache?.tournamentId === tournamentId && publicRevisionCache.expiresAt > now) {
    return publicRevisionCache.revision;
  }
  if (publicRevisionInflight?.tournamentId === tournamentId) return publicRevisionInflight.promise;

  const promise = getPublicTournamentRevision(tournamentId)
    .then((revision) => {
      publicRevisionCache = { tournamentId, expiresAt: Date.now() + PUBLIC_REVISION_TTL_MS, revision };
      return revision;
    })
    .finally(() => {
      if (publicRevisionInflight?.promise === promise) publicRevisionInflight = null;
    });

  publicRevisionInflight = { tournamentId, promise };
  return promise;
}
