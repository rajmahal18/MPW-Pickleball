import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { requestData, redirectBack } from "@/lib/request";
import { recalculateTournament } from "@/lib/tournament/recalculate";
import { writeAudit } from "@/lib/audit";

type ScoreStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "FORFEITED" | "INTERRUPTED";
type ScoreState = {
  homeScore: number;
  awayScore: number;
  status: ScoreStatus;
  winnerTeamId: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

function stateOf(game: {
  homeScore: number;
  awayScore: number;
  status: ScoreStatus;
  winnerTeamId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}): ScoreState {
  return {
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    status: game.status,
    winnerTeamId: game.winnerTeamId,
    startedAt: game.startedAt?.toISOString() ?? null,
    completedAt: game.completedAt?.toISOString() ?? null,
  };
}

function assertValidCompletedScore(homeScore: number, awayScore: number) {
  const winner = Math.max(homeScore, awayScore);
  const loser = Math.min(homeScore, awayScore);
  if (homeScore === awayScore) throw new Error("A completed game cannot be tied.");
  if (winner < 11 || winner - loser < 2) {
    throw new Error("A completed game must reach at least 11 points and be won by at least two points.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const user = await requireAdmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { gameId } = await params;
  const data = await requestData(request);
  const action = String(data.action || "");
  const expectedVersion = data.version === undefined || data.version === "" ? null : Number(data.version);
  const reason = String(data.reason || "").trim().slice(0, 500) || null;
  if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 0)) {
    return NextResponse.redirect(redirectBack(request, `/admin/score/${gameId}`, { error: "Invalid score version." }), 303);
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const game = await tx.game.findUnique({ where: { id: gameId }, include: { matchup: true } });
        if (!game) throw new Error("Game not found.");
        if (expectedVersion !== null && game.version !== expectedVersion) {
          throw new Error("The score changed in another session. Refresh before submitting again.");
        }
        const before = stateOf(game);
        const next: ScoreState = { ...before };
        const terminal = game.status === "COMPLETED" || game.status === "FORFEITED";

        if (action === "start") {
          if (terminal) throw new Error("Reopen the decided game before changing it.");
          next.status = "LIVE";
          next.winnerTeamId = null;
          next.completedAt = null;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
        } else if (["increment-home", "increment-away", "decrement-home", "decrement-away"].includes(action)) {
          if (terminal) throw new Error("Reopen the decided game before changing its score.");
          const homeDelta = action === "increment-home" ? 1 : action === "decrement-home" ? -1 : 0;
          const awayDelta = action === "increment-away" ? 1 : action === "decrement-away" ? -1 : 0;
          next.homeScore = Math.max(0, game.homeScore + homeDelta);
          next.awayScore = Math.max(0, game.awayScore + awayDelta);
          next.status = "LIVE";
          next.winnerTeamId = null;
          next.completedAt = null;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
        } else if (action === "set-score") {
          const homeScore = Number(data.homeScore);
          const awayScore = Number(data.awayScore);
          if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
            throw new Error("Scores must be non-negative whole numbers.");
          }
          if (game.status === "FORFEITED") throw new Error("Reopen the forfeited game before entering a normal score.");
          next.homeScore = homeScore;
          next.awayScore = awayScore;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
          if (game.status === "COMPLETED") {
            assertValidCompletedScore(homeScore, awayScore);
            next.status = "COMPLETED";
            next.winnerTeamId = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
            next.completedAt = game.completedAt?.toISOString() ?? new Date().toISOString();
          } else {
            next.status = "LIVE";
            next.winnerTeamId = null;
            next.completedAt = null;
          }
        } else if (action === "finalize") {
          assertValidCompletedScore(game.homeScore, game.awayScore);
          next.status = "COMPLETED";
          next.winnerTeamId = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
          next.completedAt = new Date().toISOString();
        } else if (action === "reopen") {
          next.status = "LIVE";
          next.winnerTeamId = null;
          next.completedAt = null;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
        } else if (action === "interrupt") {
          if (terminal) throw new Error("Reopen the decided game before marking it interrupted.");
          next.status = "INTERRUPTED";
          next.winnerTeamId = null;
          next.completedAt = null;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
        } else if (action === "forfeit-home" || action === "forfeit-away") {
          const homeForfeits = action === "forfeit-home";
          next.homeScore = homeForfeits ? 0 : Math.max(game.homeScore, 11);
          next.awayScore = homeForfeits ? Math.max(game.awayScore, 11) : 0;
          next.status = "FORFEITED";
          next.winnerTeamId = homeForfeits ? game.awayTeamId : game.homeTeamId;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
          next.completedAt = new Date().toISOString();
        } else {
          throw new Error("Unsupported score action.");
        }

        const update = await tx.game.updateMany({
          where: { id: gameId, version: game.version },
          data: {
            homeScore: next.homeScore,
            awayScore: next.awayScore,
            status: next.status,
            winnerTeamId: next.winnerTeamId,
            startedAt: next.startedAt ? new Date(next.startedAt) : null,
            completedAt: next.completedAt ? new Date(next.completedAt) : null,
            version: { increment: 1 },
          },
        });
        if (update.count !== 1) throw new Error("Concurrent score update detected. Refresh and retry.");

        const event = await tx.scoreEvent.create({
          data: {
            gameId,
            actorId: user.id,
            action: action.toUpperCase().replaceAll("-", "_"),
            beforeState: before,
            afterState: next,
            reason,
          },
        });
        await recalculateTournament(tx, game.matchup.tournamentId, { actorId: user.id, reason: action });
        await writeAudit(tx, {
          tournamentId: game.matchup.tournamentId,
          actorId: user.id,
          action: game.status === "COMPLETED" || game.status === "FORFEITED" || action === "set-score"
            ? "SCORE_CORRECTED"
            : "SCORE_CHANGED",
          entityType: "Game",
          entityId: gameId,
          beforeState: before,
          afterState: next,
          reason,
        });
        await writeAudit(tx, {
          tournamentId: game.matchup.tournamentId,
          actorId: user.id,
          action: "SCORE_EVENT_CREATED",
          entityType: "ScoreEvent",
          entityId: event.id,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.redirect(
      redirectBack(request, `/admin/score/${gameId}`, { success: "Score state saved and dependent rankings recalculated." }),
      303,
    );
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = code === "P2034"
      ? "The game changed concurrently. Refresh and retry."
      : error instanceof Error
        ? error.message
        : "Score update failed.";
    return NextResponse.redirect(redirectBack(request, `/admin/score/${gameId}`, { error: message }), 303);
  }
}
