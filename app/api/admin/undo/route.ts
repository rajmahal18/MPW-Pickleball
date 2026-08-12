import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { requestData, redirectBack } from "@/lib/request";
import { captureTournamentSnapshot, restoreTournamentSnapshot } from "@/lib/tournament/snapshot";
import { recalculateTournament } from "@/lib/tournament/recalculate";
import { writeAudit } from "@/lib/audit";

const GAME_STATUSES = ["SCHEDULED", "LIVE", "COMPLETED", "FORFEITED", "INTERRUPTED"] as const;
const MATCHUP_STAGES = ["GROUP", "ROUND_ROBIN", "QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE", "CUSTOM"] as const;
const LONG_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

function gameStatus(value: unknown) {
  if (typeof value !== "string" || !GAME_STATUSES.includes(value as (typeof GAME_STATUSES)[number])) {
    throw new Error("The score event contains an invalid previous match status.");
  }
  return value as (typeof GAME_STATUSES)[number];
}

function matchupStage(value: string) {
  if (!MATCHUP_STAGES.includes(value as (typeof MATCHUP_STAGES)[number])) throw new Error("Invalid tournament stage.");
  return value as (typeof MATCHUP_STAGES)[number];
}

async function resetMatchups(tx: Prisma.TransactionClient, tournamentId: string, matchupIds: string[]) {
  if (!matchupIds.length) throw new Error("No team matchups matched the selected rollback scope.");
  await tx.scoreEvent.deleteMany({ where: { game: { matchupId: { in: matchupIds } } } });
  await tx.game.updateMany({
    where: { matchupId: { in: matchupIds } },
    data: {
      homeScore: 0,
      awayScore: 0,
      status: "SCHEDULED",
      winnerTeamId: null,
      startedAt: null,
      completedAt: null,
      version: { increment: 1 },
    },
  });
  const targets = await tx.matchup.findMany({
    where: { tournamentId, id: { in: matchupIds } },
    include: { lineups: true, games: true },
  });
  for (const matchup of targets) {
    const status = !matchup.homeTeamId || !matchup.awayTeamId
      ? "SCHEDULED"
      : matchup.lineups.length === 2 && matchup.games.length === matchup.gamesPerMatchup
        ? "READY"
        : "LINEUP_PENDING";
    await tx.matchup.update({
      where: { id: matchup.id },
      data: { homeWins: 0, awayWins: 0, winnerTeamId: null, status, version: { increment: 1 } },
    });
  }
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const data = await requestData(request);
  const action = String(data.action || "simulation");
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tournament) return new NextResponse("Tournament not found", { status: 404 });

  try {
    if (action === "simulation") {
      const runId = data.runId ? String(data.runId) : undefined;
      const run = await prisma.simulationRun.findFirst({
        where: { tournamentId: tournament.id, status: "COMPLETED", ...(runId ? { id: runId } : {}) },
        orderBy: { createdAt: "desc" },
      });
      if (!run) throw new Error("No completed simulation run is available to undo.");
      const options = (run.options || {}) as Record<string, unknown>;
      const checkpointId = String(options.checkpointId || "");
      const checkpoint = await prisma.checkpoint.findFirst({ where: { id: checkpointId, tournamentId: tournament.id } });
      if (!checkpoint) throw new Error("The simulation safety checkpoint is missing.");
      await prisma.$transaction(async (tx) => {
        await restoreTournamentSnapshot(tx, tournament.id, checkpoint.snapshot);
        await recalculateTournament(tx, tournament.id, { actorId: user.id, reason: "Simulation undo" });
        await tx.simulationRun.update({ where: { id: run.id }, data: { status: "UNDONE", completedAt: new Date() } });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "SIMULATION_UNDONE", entityType: "SimulationRun", entityId: run.id });
      }, LONG_TRANSACTION_OPTIONS);
      return NextResponse.redirect(redirectBack(request, "/admin/simulation", { success: "Simulation run undone from its automatic checkpoint." }), 303);
    }

    if (action === "score-event") {
      const gameId = String(data.gameId || "");
      await prisma.$transaction(async (tx) => {
        const event = await tx.scoreEvent.findFirst({ where: { gameId, undoneAt: null }, orderBy: { createdAt: "desc" } });
        if (!event) throw new Error("No score change is available to undo.");
        const before = event.beforeState as Record<string, unknown>;
        await tx.game.update({
          where: { id: gameId },
          data: {
            homeScore: Number(before.homeScore ?? 0),
            awayScore: Number(before.awayScore ?? 0),
            status: gameStatus(before.status || "SCHEDULED"),
            winnerTeamId: (before.winnerTeamId as string | null) ?? null,
            startedAt: before.startedAt ? new Date(String(before.startedAt)) : null,
            completedAt: before.completedAt ? new Date(String(before.completedAt)) : null,
            version: { increment: 1 },
          },
        });
        await tx.scoreEvent.update({ where: { id: event.id }, data: { undoneAt: new Date() } });
        await recalculateTournament(tx, tournament.id, { actorId: user.id, reason: "Score event undo" });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "SCORE_EVENT_UNDONE",
          entityType: "ScoreEvent",
          entityId: event.id,
          beforeState: event.afterState,
          afterState: event.beforeState,
        });
      }, LONG_TRANSACTION_OPTIONS);
      return NextResponse.redirect(redirectBack(request, `/admin/score/${gameId}`, { success: "Latest score change undone." }), 303);
    }

    if (["matchup", "round", "stage"].includes(action)) {
      const matchupId = String(data.matchupId || "");
      const roundKey = String(data.roundKey || "");
      const stageKey = String(data.stage || "");
      if (String(data.confirmation || "") !== "UNDO") throw new Error('Type "UNDO" to confirm this rollback.');

      let where: Prisma.MatchupWhereInput;
      let auditScope = "";
      if (action === "matchup") {
        if (!matchupId) throw new Error("Select a team matchup.");
        where = { tournamentId: tournament.id, id: matchupId };
        auditScope = matchupId;
      } else if (action === "round") {
        const [divisionId, rawStage, roundNumberText] = roundKey.split("|");
        const roundNumber = Number(roundNumberText);
        if (!divisionId || !Number.isInteger(roundNumber) || roundNumber < 1) throw new Error("Select a valid division round.");
        where = { tournamentId: tournament.id, divisionId, stage: matchupStage(rawStage || ""), roundNumber };
        auditScope = roundKey;
      } else {
        const [divisionId, rawStage] = stageKey.split("|");
        if (!divisionId) throw new Error("Select a valid division stage.");
        where = { tournamentId: tournament.id, divisionId, stage: matchupStage(rawStage || "") };
        auditScope = stageKey;
      }

      const targets = await prisma.matchup.findMany({ where, select: { id: true } });
      const targetIds = targets.map((entry) => entry.id);
      await prisma.$transaction(async (tx) => {
        const snapshot = await captureTournamentSnapshot(tx, tournament.id);
        const checkpoint = await tx.checkpoint.create({
          data: {
            tournamentId: tournament.id,
            name: `Before ${action} undo · ${new Date().toISOString()}`,
            kind: "AUTOMATIC",
            snapshot,
            createdById: user.id,
          },
        });
        await resetMatchups(tx, tournament.id, targetIds);
        await recalculateTournament(tx, tournament.id, { actorId: user.id, reason: `${action} undo` });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: `${action.toUpperCase()}_UNDONE`,
          entityType: action === "matchup" ? "Matchup" : action === "round" ? "Round" : "Stage",
          entityId: action === "matchup" ? matchupId : undefined,
          reason: auditScope,
          afterState: { affectedMatchupIds: targetIds, safetyCheckpointId: checkpoint.id },
        });
      }, LONG_TRANSACTION_OPTIONS);
      return NextResponse.redirect(redirectBack(request, "/admin/checkpoints", { success: `${action} rollback completed and dependencies recalculated.` }), 303);
    }

    throw new Error("Unsupported undo action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Undo failed.";
    const destination = action === "score-event" ? "/admin" : action === "simulation" ? "/admin/simulation" : "/admin/checkpoints";
    return NextResponse.redirect(redirectBack(request, destination, { error: message }), 303);
  }
}
