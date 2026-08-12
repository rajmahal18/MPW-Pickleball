import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { assertSameOrigin, requestData, redirectBack } from "@/lib/request";
import { captureTournamentSnapshot } from "@/lib/tournament/snapshot";
import { executeSimulation, type SimulationOptions } from "@/lib/tournament/simulation";

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  const user = await requireAdmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tournament) return new NextResponse("Tournament not found", { status: 404 });
  if (!tournament.simulationMode) return new NextResponse("Simulation Mode is disabled.", { status: 409 });
  if (process.env.NODE_ENV === "production" && !tournament.destructiveToolsEnabled) {
    return new NextResponse("Destructive simulation tools are disabled in production.", { status: 403 });
  }

  const data = await requestData(request);
  const winnerValues = ["HOME", "AWAY", "RANDOM"] as const;
  const scoreStyleValues = ["RANDOM", "DOMINANT", "CLOSE", "DEUCE"] as const;
  const outcomeValues = ["RANDOM", "HOME", "AWAY", "SWEEP_HOME", "SWEEP_AWAY", "CLOSE_HOME", "CLOSE_AWAY"] as const;
  const stageValues = ["GROUP", "ROUND_ROBIN", "QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE", "CUSTOM"] as const;
  const requestedWinner = data.winner ? String(data.winner) : undefined;
  const requestedStyle = data.scoreStyle ? String(data.scoreStyle) : undefined;
  const requestedOutcome = data.matchupOutcome ? String(data.matchupOutcome) : undefined;
  const requestedCount = data.count ? Number(data.count) : undefined;
  const options: SimulationOptions = {
    kind: String(data.kind || "QUICK_SCENARIO"),
    seed: String(data.seed || Date.now()),
    targetId: data.targetId ? String(data.targetId) : undefined,
    winner: winnerValues.find((value) => value === requestedWinner),
    scoreStyle: scoreStyleValues.find((value) => value === requestedStyle),
    matchupOutcome: outcomeValues.find((value) => value === requestedOutcome),
    count: requestedCount && Number.isFinite(requestedCount) ? Math.max(1, Math.min(500, Math.floor(requestedCount))) : undefined,
    selectedPlayerId: data.selectedPlayerId ? String(data.selectedPlayerId) : undefined,
    divisionId: data.divisionId ? String(data.divisionId) : undefined,
    stage: stageValues.find((value) => value === String(data.stage || "")),
    autoGeneratePairs: data.autoGeneratePairs === "on",
  };
  const run = await prisma.simulationRun.create({
    data: {
      tournamentId: tournament.id,
      createdById: user.id,
      kind: options.kind,
      seed: options.seed,
      status: "RUNNING",
      options: jsonSafe(options),
    },
  });

  try {
    const checkpoint = await prisma.$transaction(async (tx) => {
      const snapshot = await captureTournamentSnapshot(tx, tournament.id);
      const created = await tx.checkpoint.create({
        data: {
          tournamentId: tournament.id,
          name: `Before ${options.kind} - ${run.id.slice(-6)}`,
          kind: "AUTOMATIC",
          snapshot,
          createdById: user.id,
        },
      });
      await tx.simulationRun.update({
        where: { id: run.id },
        data: { options: jsonSafe({ ...options, checkpointId: created.id }) },
      });
      return created;
    });

    const result = await prisma.$transaction(
      async (tx) => executeSimulation(tx, tournament.id, user.id, run.id, options),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 30_000,
        timeout: 300_000,
      },
    );
    await prisma.simulationRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", result: jsonSafe({ ...result, checkpointId: checkpoint.id }), completedAt: new Date() },
    });
    return NextResponse.redirect(redirectBack(request, "/admin/simulation", { success: `Simulation completed (${run.id.slice(-6)}).` }), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simulation failed.";
    await prisma.simulationRun.update({ where: { id: run.id }, data: { status: "FAILED", error: message, completedAt: new Date() } });
    return NextResponse.redirect(redirectBack(request, "/admin/simulation", { error: message }), 303);
  }
}
