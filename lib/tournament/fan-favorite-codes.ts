import { prisma } from "@/lib/prisma";

export type PublicVotingCodeBatch = {
  id: string;
  releaseAt: string;
  quantity: number;
  usedCount: number;
  remainingCount: number;
  soldOut: boolean;
};

export type PublicVotingCodeSnapshot = {
  latestBatch: PublicVotingCodeBatch | null;
  availableCodes: string[];
  availableCount: number;
  nextBatch: { id: string; releaseAt: string; quantity: number } | null;
  serverTime: string;
};

const TTL_MS = 800;
const cache = new Map<string, { expiresAt: number; value: PublicVotingCodeSnapshot }>();
const inflight = new Map<string, Promise<PublicVotingCodeSnapshot>>();
const epochs = new Map<string, number>();

export function invalidatePublicVotingCodeSnapshot(tournamentId: string) {
  cache.delete(tournamentId);
  inflight.delete(tournamentId);
  epochs.set(tournamentId, (epochs.get(tournamentId) ?? 0) + 1);
}

async function loadSnapshot(tournamentId: string): Promise<PublicVotingCodeSnapshot> {
  const now = new Date();
  const [releasedBatches, next] = await Promise.all([
    prisma.votingCodeBatch.findMany({
      where: { tournamentId, cancelledAt: null, releaseAt: { lte: now } },
      orderBy: [{ releaseAt: "desc" }, { createdAt: "desc" }],
      include: {
        codes: {
          select: { status: true, publicCode: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.votingCodeBatch.findFirst({
      where: { tournamentId, cancelledAt: null, releaseAt: { gt: now } },
      orderBy: [{ releaseAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, releaseAt: true, quantity: true },
    }),
  ]);

  const latest = releasedBatches[0] ?? null;
  const latestBatch = latest
    ? (() => {
        const remainingCount = latest.codes.filter(
          (code) => (code.status === "UNUSED" || code.status === "ISSUED") && code.publicCode,
        ).length;
        const usedCount = latest.codes.filter((code) => code.status === "USED").length;
        return {
          id: latest.id,
          releaseAt: latest.releaseAt.toISOString(),
          quantity: latest.quantity,
          usedCount,
          remainingCount,
          soldOut: remainingCount === 0 && usedCount >= latest.quantity,
        };
      })()
    : null;

  // A released code stays publicly available until it is actually consumed. This
  // prevents an older batch with leftovers from silently disappearing when the
  // next scheduled batch opens.
  const availableCodes: string[] = Array.from(
    new Set<string>(
      releasedBatches.flatMap((batch) =>
        batch.codes
          .filter((code) => (code.status === "UNUSED" || code.status === "ISSUED") && code.publicCode)
          .map((code) => code.publicCode!),
      ),
    ),
  );

  return {
    latestBatch,
    availableCodes,
    availableCount: availableCodes.length,
    nextBatch: next ? { id: next.id, releaseAt: next.releaseAt.toISOString(), quantity: next.quantity } : null,
    serverTime: now.toISOString(),
  };
}

export async function getPublicVotingCodeSnapshot(tournamentId: string) {
  const now = Date.now();
  const cached = cache.get(tournamentId);
  if (cached && cached.expiresAt > now) return cached.value;
  const pending = inflight.get(tournamentId);
  if (pending) return pending;
  const epoch = epochs.get(tournamentId) ?? 0;
  const request = loadSnapshot(tournamentId)
    .then((value) => {
      if ((epochs.get(tournamentId) ?? 0) === epoch) {
        cache.set(tournamentId, { expiresAt: Date.now() + TTL_MS, value });
      }
      return value;
    })
    .finally(() => inflight.delete(tournamentId));
  inflight.set(tournamentId, request);
  return request;
}
