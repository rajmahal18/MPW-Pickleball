import { prisma } from "@/lib/prisma";

export type VotingBatchSummary = {
  id: string;
  quantity: number;
  releaseAt: string;
  cancelledAt: string | null;
  usedCount: number;
  remainingCount: number;
  soldOutAt: string | null;
  halfConsumedAt: string | null;
  elapsedSeconds: number;
  consumptionRatePerMinute: number;
  state: "SCHEDULED" | "ACTIVE" | "SOLD_OUT" | "CANCELLED";
  pace: "FAST" | "HEALTHY" | "SLOW" | "WAITING";
  recommendation: string | null;
};

export type TeamVoteDistribution = {
  teamId: string;
  name: string;
  shortName: string;
  votes: number;
  percentage: number;
};

export type VotingAdminSnapshot = {
  generatedAt: string;
  batches: VotingBatchSummary[];
  teamDistribution: TeamVoteDistribution[];
  totalPlayerVotes: number;
  consumedPublicCodes: number;
};

function round(value: number, decimals = 1) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

export async function getVotingAdminSnapshot(tournamentId: string): Promise<VotingAdminSnapshot> {
  const now = new Date();
  const [batches, groupedVotes, teams] = await Promise.all([
    prisma.votingCodeBatch.findMany({
      where: { tournamentId },
      orderBy: [{ releaseAt: "desc" }, { createdAt: "desc" }],
      take: 12,
      include: { codes: { select: { status: true, usedAt: true } } },
    }),
    prisma.fanVote.groupBy({
      by: ["playerId"],
      where: { tournamentId },
      _count: { _all: true },
    }),
    prisma.team.findMany({
      where: { division: { tournamentId } },
      select: { id: true, name: true, shortName: true },
      orderBy: { shortName: "asc" },
    }),
  ]);

  const players = groupedVotes.length ? await prisma.player.findMany({
    where: { id: { in: groupedVotes.map((row) => row.playerId) } },
    select: { id: true, team: { select: { id: true, name: true, shortName: true } } },
  }) : [];
  const playerTeam = new Map(players.map((player) => [player.id, player.team]));
  const byTeam = new Map<string, TeamVoteDistribution>(teams.map((team) => [team.id, { teamId: team.id, name: team.name, shortName: team.shortName, votes: 0, percentage: 0 }]));
  const totalPlayerVotes = groupedVotes.reduce((sum, row) => sum + row._count._all, 0);
  for (const row of groupedVotes) {
    const team = playerTeam.get(row.playerId);
    if (!team) continue;
    const current = byTeam.get(team.id) ?? { teamId: team.id, name: team.name, shortName: team.shortName, votes: 0, percentage: 0 };
    current.votes += row._count._all;
    byTeam.set(team.id, current);
  }
  const teamDistribution = [...byTeam.values()]
    .map((team) => ({ ...team, percentage: totalPlayerVotes ? round((team.votes / totalPlayerVotes) * 100) : 0 }))
    .sort((a, b) => b.votes - a.votes || a.shortName.localeCompare(b.shortName));

  const summaries = batches.map<VotingBatchSummary>((batch) => {
    const usedTimes = batch.codes
      .filter((code) => code.status === "USED" && code.usedAt)
      .map((code) => code.usedAt!)
      .sort((a, b) => a.getTime() - b.getTime());
    const usedCount = usedTimes.length;
    const remainingCount = batch.codes.filter((code) => code.status === "UNUSED" || code.status === "ISSUED").length;
    const soldOutAt = usedCount >= batch.quantity ? usedTimes[batch.quantity - 1] ?? usedTimes.at(-1) ?? null : null;
    const halfIndex = Math.ceil(batch.quantity / 2) - 1;
    const halfConsumedAt = usedTimes.length > halfIndex ? usedTimes[halfIndex]! : null;
    const released = batch.releaseAt <= now;
    const elapsedEnd = soldOutAt ?? (released ? now : batch.releaseAt);
    const elapsedSeconds = released ? Math.max(0, Math.round((elapsedEnd.getTime() - batch.releaseAt.getTime()) / 1000)) : 0;
    const elapsedMinutes = Math.max(elapsedSeconds / 60, 1 / 60);
    const rate = released ? usedCount / elapsedMinutes : 0;
    const fraction = batch.quantity ? usedCount / batch.quantity : 0;
    const state = batch.cancelledAt ? "CANCELLED" : !released ? "SCHEDULED" : soldOutAt ? "SOLD_OUT" : "ACTIVE";
    let pace: VotingBatchSummary["pace"] = "WAITING";
    let recommendation: string | null = null;
    if (state === "SOLD_OUT") {
      if (elapsedSeconds <= 10 * 60) {
        pace = "FAST";
        recommendation = "Fast sell-out — consider increasing the next batch.";
      } else pace = "HEALTHY";
    } else if (state === "ACTIVE") {
      const halfSeconds = halfConsumedAt ? Math.max(0, (halfConsumedAt.getTime() - batch.releaseAt.getTime()) / 1000) : null;
      if (halfSeconds !== null && halfSeconds <= 5 * 60) {
        pace = "FAST";
        recommendation = "Fast consumption — consider increasing the next batch.";
      } else if (elapsedSeconds >= 20 * 60 && fraction < 0.5) {
        pace = "SLOW";
        recommendation = "Slow consumption — consider reducing the next batch.";
      } else if (elapsedSeconds >= 5 * 60 || usedCount > 0) pace = "HEALTHY";
    }
    return {
      id: batch.id,
      quantity: batch.quantity,
      releaseAt: batch.releaseAt.toISOString(),
      cancelledAt: batch.cancelledAt?.toISOString() ?? null,
      usedCount,
      remainingCount,
      soldOutAt: soldOutAt?.toISOString() ?? null,
      halfConsumedAt: halfConsumedAt?.toISOString() ?? null,
      elapsedSeconds,
      consumptionRatePerMinute: round(rate),
      state,
      pace,
      recommendation,
    };
  });

  return {
    generatedAt: now.toISOString(),
    batches: summaries,
    teamDistribution,
    totalPlayerVotes,
    consumedPublicCodes: summaries.reduce((sum, batch) => sum + batch.usedCount, 0),
  };
}
