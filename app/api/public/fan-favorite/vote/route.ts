import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { attachAnonymousVisitorCookie, getAnonymousVisitor } from "@/lib/anonymous-visitor";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { requestData, requestIp } from "@/lib/request";
import { hashNetworkIdentifier, hashVotingCode, normalizeVotingCode, votingCodeHint } from "@/lib/tournament/voting";
import { writeAudit } from "@/lib/audit";
import { invalidatePublicVotingCodeSnapshot } from "@/lib/tournament/fan-favorite-codes";
import { recognitionDivisionSlug } from "@/lib/tournament/recognition-division";
import { FAN_FAVORITE_VOTE_COOLDOWN_SECONDS } from "@/lib/tournament/config";

const VOTE_COOLDOWN_MS = FAN_FAVORITE_VOTE_COOLDOWN_SECONDS * 1000;

type VoteResult =
  | { ok: true }
  | { ok: false; reason: string; retryAfterSeconds?: number };

function retryAfterSeconds(createdAt: Date) {
  return Math.max(1, Math.ceil((createdAt.getTime() + VOTE_COOLDOWN_MS - Date.now()) / 1000));
}

export async function POST(request: NextRequest) {
  const visitor = getAnonymousVisitor(request);
  const respond = (body: Record<string, unknown>, status = 200, headers?: Record<string, string>) =>
    attachAnonymousVisitorCookie(
      NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", ...headers } }),
      visitor,
    );

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
    return respond(
      { error: "Voting is busy or this code has been tried too many times. Please try again shortly." },
      429,
      { "Retry-After": String(blockedLimiter.retryAfterSeconds) },
    );
  }
  if (!malePlayerId || !femalePlayerId || code.length < 8) {
    return respond({ error: "Select one male player, one female player, and enter a valid voting code." }, 400);
  }

  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  if (!tournament) return respond({ error: "Tournament not found." }, 404);
  if (!tournament.votingOpen || (tournament.votingDeadline && tournament.votingDeadline <= new Date())) {
    return respond({ error: "Fan Favorite voting is closed." }, 409);
  }

  // The cooldown is based only on a previously accepted vote. Rejected/invalid
  // attempts never create a successful VoteAttempt and therefore never start it.
  const recentSuccess = await prisma.voteAttempt.findFirst({
    where: {
      tournamentId: tournament.id,
      visitorKey: visitor.key,
      success: true,
      createdAt: { gt: new Date(Date.now() - VOTE_COOLDOWN_MS) },
    },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (recentSuccess) {
    const retry = retryAfterSeconds(recentSuccess.createdAt);
    return respond(
      { error: `Please wait ${retry}s before voting again.`, retryAfterSeconds: retry },
      429,
      { "Retry-After": String(retry) },
    );
  }

  let result: VoteResult;
  try {
    result = await prisma.$transaction(
      async (tx) => {
        // Re-check inside the serializable transaction so two near-simultaneous
        // valid requests from the same browser cannot both bypass the cooldown.
        const transactionalRecentSuccess = await tx.voteAttempt.findFirst({
          where: {
            tournamentId: tournament.id,
            visitorKey: visitor.key,
            success: true,
            createdAt: { gt: new Date(Date.now() - VOTE_COOLDOWN_MS) },
          },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
        });
        if (transactionalRecentSuccess) {
          return {
            ok: false as const,
            reason: "VOTE_COOLDOWN" as const,
            retryAfterSeconds: retryAfterSeconds(transactionalRecentSuccess.createdAt),
          };
        }

        const eligiblePlayers = await tx.player.findMany({
          where: {
            id: { in: [malePlayerId, femalePlayerId] },
            tournamentId: tournament.id,
            isActive: true,
            participationStatus: "CONFIRMED",
            teamId: { not: null },
            team: { division: { isPublic: true, entrantType: "TEAM", slug: recognitionDivisionSlug() } },
          },
          select: { id: true, sex: true },
        });
        const malePlayer = eligiblePlayers.find((candidate) => candidate.id === malePlayerId && candidate.sex === "MALE");
        const femalePlayer = eligiblePlayers.find((candidate) => candidate.id === femalePlayerId && candidate.sex === "FEMALE");
        const votingCode = await tx.votingCode.findFirst({
          where: { tournamentId: tournament.id, codeHash: hashVotingCode(code) },
          include: { batch: { select: { releaseAt: true, cancelledAt: true } } },
        });
        const now = new Date();
        let reason: string | null = null;
        if (!malePlayer) reason = "INELIGIBLE_MALE_PLAYER";
        else if (!femalePlayer) reason = "INELIGIBLE_FEMALE_PLAYER";
        else if (!votingCode) reason = "INVALID_CODE";
        else if (votingCode.batch?.cancelledAt) reason = "CANCELLED_BATCH";
        else if (votingCode.batch && votingCode.batch.releaseAt > now) reason = "CODE_NOT_RELEASED";
        else if (!(votingCode.status === "UNUSED" || votingCode.status === "ISSUED")) {
          reason = votingCode.status === "USED" ? "REUSED_CODE" : `${votingCode.status}_CODE`;
        }

        if (reason) {
          await tx.voteAttempt.create({
            data: { tournamentId: tournament.id, ipHash, visitorKey: visitor.key, codeHint: votingCodeHint(code), success: false, reason },
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

        const validVotingCode = votingCode!;
        const validMalePlayer = malePlayer!;
        const validFemalePlayer = femalePlayer!;
        const consumed = await tx.votingCode.updateMany({
          where: { id: validVotingCode.id, status: { in: ["UNUSED", "ISSUED"] } },
          data: { status: "USED", usedAt: now },
        });
        if (consumed.count !== 1) {
          await tx.voteAttempt.create({
            data: {
              tournamentId: tournament.id,
              ipHash,
              visitorKey: visitor.key,
              codeHint: votingCodeHint(code),
              success: false,
              reason: "RACE_REJECTED",
            },
          });
          return { ok: false as const, reason: "CODE_ALREADY_CONSUMED" };
        }

        const votes = await Promise.all([
          tx.fanVote.create({
            data: { tournamentId: tournament.id, votingCodeId: validVotingCode.id, sexCategory: "MALE", playerId: validMalePlayer.id },
          }),
          tx.fanVote.create({
            data: { tournamentId: tournament.id, votingCodeId: validVotingCode.id, sexCategory: "FEMALE", playerId: validFemalePlayer.id },
          }),
        ]);
        await tx.voteAttempt.create({
          data: { tournamentId: tournament.id, ipHash, visitorKey: visitor.key, codeHint: votingCodeHint(code), success: true },
        });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          action: "FAN_VOTE_ACCEPTED",
          entityType: "FanVote",
          entityId: validVotingCode.id,
          afterState: {
            votingCodeId: validVotingCode.id,
            votes: votes.map((vote) => ({ id: vote.id, playerId: vote.playerId, sexCategory: vote.sexCategory })),
          },
        });
        return { ok: true as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    const prismaCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (prismaCode === "P2034" || prismaCode === "P2002") {
      // A concurrent successful request may have committed while this transaction
      // was retry-rejected. Surface the real cooldown when that is what happened.
      const winner = await prisma.voteAttempt.findFirst({
        where: {
          tournamentId: tournament.id,
          visitorKey: visitor.key,
          success: true,
          createdAt: { gt: new Date(Date.now() - VOTE_COOLDOWN_MS) },
        },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      if (winner) {
        const retry = retryAfterSeconds(winner.createdAt);
        return respond(
          { error: `Please wait ${retry}s before voting again.`, retryAfterSeconds: retry },
          429,
          { "Retry-After": String(retry) },
        );
      }
      return respond({ error: "This voting code was already consumed. Please use a different code." }, 409);
    }
    throw error;
  }

  if (!result.ok) {
    if (result.reason === "VOTE_COOLDOWN") {
      const retry = result.retryAfterSeconds ?? FAN_FAVORITE_VOTE_COOLDOWN_SECONDS;
      return respond(
        { error: `Please wait ${retry}s before voting again.`, retryAfterSeconds: retry },
        429,
        { "Retry-After": String(retry) },
      );
    }
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
    return respond({ error: messageByReason[result.reason] || "Vote rejected." }, 409);
  }

  invalidatePublicVotingCodeSnapshot(tournament.id);
  return respond(
    { ok: true, message: "Vote recorded successfully.", cooldownSeconds: FAN_FAVORITE_VOTE_COOLDOWN_SECONDS },
    201,
  );
}
