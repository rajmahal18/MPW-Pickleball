import { prisma } from "@/lib/prisma";

const CACHE_TTL_MS = 5_000;
let cache: { expiresAt: number; id: string | null } | null = null;
let inflight: Promise<string | null> | null = null;

export async function getPublishedTournamentId() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.id;
  if (inflight) return inflight;

  inflight = prisma.tournament.findFirst({
    where: { isPublished: true },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  }).then((tournament) => {
    const id = tournament?.id ?? null;
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, id };
    return id;
  }).finally(() => {
    inflight = null;
  });

  return inflight;
}

export function invalidatePublishedTournamentId() {
  cache = null;
  inflight = null;
}
