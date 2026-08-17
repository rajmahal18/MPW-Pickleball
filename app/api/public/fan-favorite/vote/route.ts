import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { requestData, requestIp } from "@/lib/request";
import { hashNetworkIdentifier, hashVotingCode, normalizeVotingCode, votingCodeHint } from "@/lib/tournament/voting";
import { writeAudit } from "@/lib/audit";
import { invalidateFanFavoriteSnapshot } from "@/lib/tournament/fan-favorite";
import { invalidatePublicVotingCodeSnapshot } from "@/lib/tournament/fan-favorite-codes";

export async function POST(request: Request) {
  const input = await requestData(request);
  const malePlayerId = String(input.malePlayerId || "");
  const femalePlayerId = String(input.femalePlayerId || "");
  const code = normalizeVotingCode(String(input.code || ""));
  const ipHash = hashNetworkIdentifier(requestIp(request));
  const globalLimiter = checkRateLimit("fan-vote:global", 1200, 60_000);
  const ipLimiter = checkRateLimit(`fan-vote:ip:${ipHash}`, 180, 60_000);
  const codeLimiter = code.length >= 8 ? checkRateLimit(`fan-vote:code:${hashVotingCode(code)}`, 8, 60_000) : { allowed: true, retryAfterSeconds: 0 };
  const blockedLimiter = !globalLimiter.allowed ? globalLimiter : !ipLimiter.allowed ? ipLimiter : !codeLimiter.allowed ? codeLimiter : null;
  if (blockedLimiter) {
    return NextResponse.json(
      { error: "Voting is busy or this code has been tried too many times. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(blockedLimiter.retryAfterSeconds) } },
    );
  }
  if (!malePlayerId || !femalePlayerId || code.length < 8) {
    return NextResponse.json({ error: "Select one male player, one female player, and enter a valid voting code." }, { status: 400 });
  }

  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  if (!tournament) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  if (!tournament.votingOpen || (tournament.votingDeadline && tournament.votingDeadline <= new Date())) {
    return NextResponse.json({ error: "Fan Favorite voting is closed." }, { status: 409 });
  }

  let result: { ok: true } | { ok: false; reason: string };
  try {
    result = await prisma.$transaction(
    async (tx) => {
      const eligiblePlayers = await tx.player.findMany({
        where: {
          id: { in: [malePlayerId, femalePlayerId] },
          tournamentId: tournament.id,
          isActive: true,
          participationStatus: "CONFIRMED",
          teamId: { not: null },
          team: { division: { isPublic: true } },
        },
        select: { id: true, sex: true },
      });
      const player = eligiblePlayers.find((candidate) => candidate.id === malePlayerId && candidate.sex === "MALE");
      const femalePlayer = eligiblePlayers.find((candidate) => candidate.id === femalePlayerId && candidate.sex === "FEMALE");
      const votingCode = await tx.votingCode.findFirst({
        where: { tournamentId: tournament.id, codeHash: hashVotingCode(code) },
        include: { batch: { select: { releaseAt: true, cancelledAt: true } } },
      });
      const now = new Date();
      let reason: string | null = null;
      if (!player) reason = "INELIGIBLE_MALE_PLAYER";
      else if (!femalePlayer) reason = "INELIGIBLE_FEMALE_PLAYER";
      else if (!votingCode) reason = "INVALID_CODE";
      else if (votingCode.batch?.cancelledAt) reason = "CANCELLED_BATCH";
      else if (votingCode.batch && votingCode.batch.releaseAt > now) reason = "CODE_NOT_RELEASED";
      else if (!(votingCode.status === "UNUSED" || votingCode.status === "ISSUED")) {
        reason = votingCode.status === "USED" ? "REUSED_CODE" : `${votingCode.status}_CODE`;
      }

      if (reason) {
        await tx.voteAttempt.create({
          data: { tournamentId: tournament.id, ipHash, codeHint: votingCodeHint(code), success: false, reason },
        });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          action: "FAN_VOTE_REJECTED",
          entityType: "VotingCode",
          entityId: votingCode?.id,
          reason,
        });
        return { ok: false as const, reason };
      }
      const maleVotePlayer = player!;
      const femaleVotePlayer = femalePlayer!;

      const consumed = await tx.votingCode.updateMany({
        where: { id: votingCode!.id, status: { in: ["UNUSED", "ISSUED"] } },
        data: { status: "USED", usedAt: now },
      });
      if (consumed.count !== 1) {
        await tx.voteAttempt.create({
          data: {
            tournamentId: tournament.id,
            ipHash,
            codeHint: votingCodeHint(code),
            success: false,
            reason: "RACE_REJECTED",
          },
        });
        return { ok: false as const, reason: "CODE_ALREADY_CONSUMED" };
      }

      const votes = await Promise.all([
        tx.fanVote.create({
          data: { tournamentId: tournament.id, votingCodeId: votingCode!.id, sexCategory: "MALE", playerId: maleVotePlayer.id },
        }),
        tx.fanVote.create({
          data: { tournamentId: tournament.id, votingCodeId: votingCode!.id, sexCategory: "FEMALE", playerId: femaleVotePlayer.id },
        }),
      ]);
      await tx.voteAttempt.create({
        data: { tournamentId: tournament.id, ipHash, codeHint: votingCodeHint(code), success: true },
      });
      await writeAudit(tx, {
        tournamentId: tournament.id,
        action: "FAN_VOTE_ACCEPTED",
        entityType: "FanVote",
        entityId: votingCode!.id,
        afterState: {
          votingCodeId: votingCode!.id,
          votes: votes.map((vote) => ({ id: vote.id, playerId: vote.playerId, sexCategory: vote.sexCategory })),
        },
      });
      return { ok: true as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "P2034" || code === "P2002") {
      return NextResponse.json({ error: "This voting code was already consumed. Please use a different code." }, { status: 409 });
    }
    throw error;
  }

  if (!result.ok) {
    const messageByReason: Record<string, string> = {
      INVALID_CODE: "The voting code is invalid.",
      REUSED_CODE: "This voting code has already been used.",
      REVOKED_CODE: "This voting code was revoked.",
      REPLACED_CODE: "This voting code was replaced.",
      INELIGIBLE_PLAYER: "The selected player is not eligible.",
      INELIGIBLE_MALE_PLAYER: "Select an eligible male player.",
      INELIGIBLE_FEMALE_PLAYER: "Select an eligible female player.",
      CODE_ALREADY_CONSUMED: "This voting code was already consumed.",
      RACE_REJECTED: "This voting code was already consumed.",
      CODE_NOT_RELEASED: "This voting code has not been released yet.",
      CANCELLED_BATCH: "This voting-code batch was cancelled.",
    };
    return NextResponse.json({ error: messageByReason[result.reason] || "Vote rejected." }, { status: 409 });
  }
  invalidateFanFavoriteSnapshot(tournament.id);
  invalidatePublicVotingCodeSnapshot(tournament.id);
  return NextResponse.json({ ok: true, message: "Vote recorded successfully." }, { status: 201 });
}
