import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { assertSameOrigin, requestData, redirectBack } from "@/lib/request";
import { recalculateMatchup, recalculateTournament } from "@/lib/tournament/recalculate";
import { writeAudit } from "@/lib/audit";
import { assertValidCompletedScore, scoreRuleForStage } from "@/lib/tournament/rules";
import { shouldRefreshGroupDependencies } from "@/lib/tournament/standings";

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

function wantsJson(request: Request) {
  return (request.headers.get("content-type") || "").includes("application/json")
    || (request.headers.get("accept") || "").includes("application/json");
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

const liveOnlyActions = new Set(["start", "increment-home", "increment-away", "decrement-home", "decrement-away", "interrupt"]);

const scorePlayerSelect = {
  id: true,
  firstName: true,
  middleInitial: true,
  lastName: true,
  displayName: true,
  avatarUrl: true,
} as const;

export async function POST(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const asJson = wantsJson(request);
  try {
    assertSameOrigin(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request origin.";
    return asJson ? jsonError(message, 403) : new NextResponse(message, { status: 403 });
  }

  const user = await requireAdmin();
  if (!user) return asJson ? jsonError("Unauthorized", 401) : new NextResponse("Unauthorized", { status: 401 });
  const { gameId } = await params;
  const data = await requestData(request);
  const action = String(data.action || "");
  const expectedVersion = data.version === undefined || data.version === "" ? null : Number(data.version);
  const reason = String(data.reason || "").trim().slice(0, 500) || null;

  if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 0)) {
    if (asJson) return jsonError("Invalid score version.");
    return NextResponse.redirect(redirectBack(request, `/admin/score/${gameId}`, { error: "Invalid score version." }), 303);
  }

  try {
    const fresh = await prisma.$transaction(
      async (tx) => {
        const game = await tx.game.findUnique({ where: { id: gameId }, include: { matchup: { include: { division: { select: { suddenDeathAtTen: true } }, lineups: { include: { slots: true } } } } } });
        if (!game) throw new Error("Match not found.");
        if (expectedVersion !== null && game.version !== expectedVersion) throw new Error("The score changed in another session. Reload this match before submitting again.");
        if (game.matchup.stage === "QUARTERFINAL" && (game.matchup.homeQualificationSource || game.matchup.awayQualificationSource)) {
          const [groupCount, unfinishedGroups] = await Promise.all([
            tx.matchup.count({ where: { divisionId: game.matchup.divisionId, stage: "GROUP" } }),
            tx.matchup.count({ where: { divisionId: game.matchup.divisionId, stage: "GROUP", status: { notIn: ["COMPLETED", "FORFEITED"] } } }),
          ]);
          if (groupCount === 0 || unfinishedGroups > 0) throw new Error("This Quarterfinal is a standings preview until the group stage is complete.");
        }

        const scoreRule = scoreRuleForStage(game.matchup.stage, game.matchup.division.suddenDeathAtTen);
        const untouchedAfterClinch = game.matchup.status === "COMPLETED"
          && Boolean(game.matchup.winnerTeamId)
          && game.status === "SCHEDULED"
          && game.homeScore === 0
          && game.awayScore === 0;
        if (untouchedAfterClinch) throw new Error("This playoff matchup is already clinched. Remaining matches are not required.");

        const before = stateOf(game);
        const next: ScoreState = { ...before };
        const terminalBefore = game.status === "COMPLETED" || game.status === "FORFEITED";
        if (!terminalBefore) {
          const homeLineup = game.matchup.lineups.find((lineup) => lineup.teamId === game.homeTeamId);
          const awayLineup = game.matchup.lineups.find((lineup) => lineup.teamId === game.awayTeamId);
          const homeSlot = homeLineup?.slots.find((slot) => slot.slot === game.gameNumber);
          const awaySlot = awayLineup?.slots.find((slot) => slot.slot === game.gameNumber);
          if (!homeSlot || !awaySlot || homeSlot.pairId !== game.homePairId || awaySlot.pairId !== game.awayPairId) {
            throw new Error("This match is waiting for an updated lineup. Ask both sides to finish the affected lineup slot before scoring.");
          }
        }

        if (action === "start") {
          if (terminalBefore) throw new Error("Reopen the decided match before changing it.");
          next.status = "LIVE";
          next.winnerTeamId = null;
          next.completedAt = null;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
        } else if (["increment-home", "increment-away", "decrement-home", "decrement-away"].includes(action)) {
          if (terminalBefore) throw new Error("Reopen the decided match before changing its score.");
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
          if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) throw new Error("Scores must be non-negative whole numbers.");
          if (game.status === "FORFEITED") throw new Error("Reopen the forfeited match before entering a normal score.");
          if (terminalBefore && !reason) throw new Error("Enter a reason for a completed-match correction.");
          next.homeScore = homeScore;
          next.awayScore = awayScore;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
          if (game.status === "COMPLETED") {
            assertValidCompletedScore(homeScore, awayScore, scoreRule);
            next.status = "COMPLETED";
            next.winnerTeamId = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
            next.completedAt = game.completedAt?.toISOString() ?? new Date().toISOString();
          } else {
            next.status = "LIVE";
            next.winnerTeamId = null;
            next.completedAt = null;
          }
        } else if (action === "finalize") {
          assertValidCompletedScore(game.homeScore, game.awayScore, scoreRule);
          next.status = "COMPLETED";
          next.winnerTeamId = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
          next.completedAt = new Date().toISOString();
        } else if (action === "reopen") {
          if (!terminalBefore) throw new Error("Only a completed or forfeited match needs to be reopened.");
          next.status = "LIVE";
          next.winnerTeamId = null;
          next.completedAt = null;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
        } else if (action === "interrupt") {
          if (terminalBefore) throw new Error("Reopen the decided match before marking it interrupted.");
          next.status = "INTERRUPTED";
          next.winnerTeamId = null;
          next.completedAt = null;
          next.startedAt = game.startedAt?.toISOString() ?? new Date().toISOString();
        } else if (action === "forfeit-home" || action === "forfeit-away") {
          if (terminalBefore) throw new Error("Reopen the decided match before applying a new forfeit result.");
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
        if (update.count !== 1) throw new Error("Concurrent score update detected. Reload this match and retry.");

        await tx.scoreEvent.create({
          data: {
            gameId,
            actorId: user.id,
            action: action.toUpperCase().replaceAll("-", "_"),
            beforeState: before,
            afterState: next,
            reason,
          },
        });

        const isPointStep = ["increment-home", "increment-away", "decrement-home", "decrement-away"].includes(action);
        const isLiveOnlyChange = liveOnlyActions.has(action) || (action === "set-score" && !terminalBefore);
        if (isLiveOnlyChange) {
          // Do not recalculate every standing/bracket on every rally. Mark the team matchup live once;
          // the expensive dependency pass happens only when a game decision can affect series results.
          if (game.matchup.status !== "LIVE" && (next.status === "LIVE" || next.status === "INTERRUPTED")) {
            await tx.matchup.update({ where: { id: game.matchupId }, data: { status: "LIVE" } });
          }
        } else {
          const matchupAfter = await recalculateMatchup(tx, game.matchupId);
          const matchupWasDecided = game.matchup.status === "COMPLETED" || game.matchup.status === "FORFEITED";
          const terminalAfter = next.status === "COMPLETED" || next.status === "FORFEITED";
          const groupResultChanged = shouldRefreshGroupDependencies(game.matchup.stage, terminalBefore, terminalAfter);
          const needsTournamentRecalc = groupResultChanged || matchupWasDecided || matchupAfter.status === "COMPLETED" || matchupAfter.status === "FORFEITED";
          if (needsTournamentRecalc) await recalculateTournament(tx, game.matchup.tournamentId, { actorId: user.id, reason: action });
        }

        // ScoreEvent is the high-frequency point-by-point audit trail. Keep the broader AuditLog for
        // operationally meaningful state changes so live scoring does not generate two logs per rally.
        if (!isPointStep) {
          await writeAudit(tx, {
            tournamentId: game.matchup.tournamentId,
            actorId: user.id,
            action: terminalBefore || action === "set-score" ? "SCORE_CORRECTED" : "SCORE_CHANGED",
            entityType: "Game",
            entityId: gameId,
            beforeState: before,
            afterState: next,
            reason,
          });
        }

        return tx.game.findUniqueOrThrow({
          where: { id: gameId },
          include: {
            homeTeam: { select: { id: true, name: true, shortName: true } },
            awayTeam: { select: { id: true, name: true, shortName: true } },
            homePair: {
              select: {
                id: true,
                label: true,
                playerA: { select: scorePlayerSelect },
                playerB: { select: scorePlayerSelect },
              },
            },
            awayPair: {
              select: {
                id: true,
                label: true,
                playerA: { select: scorePlayerSelect },
                playerB: { select: scorePlayerSelect },
              },
            },
            matchup: {
              select: {
                id: true,
                status: true,
                homeWins: true,
                awayWins: true,
                roundLabel: true,
                courtLabel: true,
                stage: true,
                division: { select: { suddenDeathAtTen: true } },
              },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 },
    );

    const payload = {
      id: fresh.id,
      version: fresh.version,
      gameNumber: fresh.gameNumber,
      homeScore: fresh.homeScore,
      awayScore: fresh.awayScore,
      status: fresh.status,
      winnerTeamId: fresh.winnerTeamId,
      startedAt: fresh.startedAt?.toISOString() ?? null,
      completedAt: fresh.completedAt?.toISOString() ?? null,
      homeTeam: { id: fresh.homeTeam.id, name: fresh.homeTeam.name, shortName: fresh.homeTeam.shortName },
      awayTeam: { id: fresh.awayTeam.id, name: fresh.awayTeam.name, shortName: fresh.awayTeam.shortName },
      homePair: { id: fresh.homePair.id, label: fresh.homePair.label, playerA: fresh.homePair.playerA, playerB: fresh.homePair.playerB },
      awayPair: { id: fresh.awayPair.id, label: fresh.awayPair.label, playerA: fresh.awayPair.playerA, playerB: fresh.awayPair.playerB },
      matchup: {
        id: fresh.matchup.id,
        status: fresh.matchup.status,
        homeWins: fresh.matchup.homeWins,
        awayWins: fresh.matchup.awayWins,
        roundLabel: fresh.matchup.roundLabel,
        courtLabel: fresh.matchup.courtLabel,
        stage: fresh.matchup.stage,
        suddenDeathAtTen: fresh.matchup.division.suddenDeathAtTen,
      },
    };

    const quickSave = liveOnlyActions.has(action) || action === "set-score";
    if (asJson) return NextResponse.json({ ok: true, game: payload, message: quickSave ? "Saved" : "Tournament state updated" });
    return NextResponse.redirect(redirectBack(request, `/admin/score/${gameId}`, { success: "Score state saved." }), 303);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = code === "P2034"
      ? "The match changed concurrently. Reload this match and retry."
      : error instanceof Error
        ? error.message
        : "Score update failed.";
    if (asJson) return jsonError(message, code === "P2034" ? 409 : 400);
    return NextResponse.redirect(redirectBack(request, `/admin/score/${gameId}`, { error: message }), 303);
  }
}
