import { prisma } from "@/lib/prisma";
import { getPublishedTournamentId } from "@/lib/tournament/public-tournament";
import { isPrivateDivisionPreviewEnabled } from "@/lib/public-preview";

const PUBLIC_REVISION_TTL_MS = 900;
let publicRevisionCache: { cacheKey: string; expiresAt: number; revision: string } | null = null;
let publicRevisionInflight: { cacheKey: string; promise: Promise<string> } | null = null;

export async function getPublicTournamentRevision(tournamentId: string) {
  const previewEnabled = await isPrivateDivisionPreviewEnabled();
  const latest = await prisma.matchup.findFirst({
    where: { tournamentId, division: previewEnabled ? {} : { isPublic: true } },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  return `${tournamentId}:${latest?.updatedAt.getTime() ?? 0}`;
}

export async function getLatestPublishedPublicTournamentRevision() {
  const [tournamentId, previewEnabled] = await Promise.all([getPublishedTournamentId(), isPrivateDivisionPreviewEnabled()]);
  if (!tournamentId) return "none:0";
  const cacheKey = `${tournamentId}:${previewEnabled ? "preview" : "public"}`;

  const now = Date.now();
  if (publicRevisionCache?.cacheKey === cacheKey && publicRevisionCache.expiresAt > now) {
    return publicRevisionCache.revision;
  }
  if (publicRevisionInflight?.cacheKey === cacheKey) return publicRevisionInflight.promise;

  const promise = getPublicTournamentRevision(tournamentId)
    .then((revision) => {
      publicRevisionCache = { cacheKey, expiresAt: Date.now() + PUBLIC_REVISION_TTL_MS, revision };
      return revision;
    })
    .finally(() => {
      if (publicRevisionInflight?.promise === promise) publicRevisionInflight = null;
    });

  publicRevisionInflight = { cacheKey, promise };
  return promise;
}
