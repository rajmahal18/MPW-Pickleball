import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/permissions";
import { assertSameOrigin, requestData, redirectBack } from "@/lib/request";
import { captureTournamentSnapshot } from "@/lib/tournament/snapshot";
import { executeSimulation, type SimulationOptions } from "@/lib/tournament/simulation";
import { invalidatePublicVotingCodeSnapshot } from "@/lib/tournament/fan-favorite-codes";
import { isProductionPrivateLabDivision, isProductionPrivateLabKind } from "@/lib/tournament/private-division-lab";

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  const user = await requireSuperadmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tournament) return new NextResponse("Tournament not found", { status: 404 });
  if (!tournament.simulationMode) return new NextResponse("Simulation Mode is disabled.", { status: 409 });
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
    seed: String(data.seed || `${Date.now()}-${randomUUID()}`),
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
  let productionLabDivisionId: string | null = null;
  if (process.env.NODE_ENV === "production") {
    if (!isProductionPrivateLabKind(options.kind)) return new NextResponse("Production lab mode allows private-division match simulation only.", { status: 403 });
    let divisionId = options.divisionId;
    if (options.kind === "GAME" && options.targetId) {
      divisionId = (await prisma.game.findFirst({ where: { id: options.targetId, matchup: { tournamentId: tournament.id } }, select: { matchup: { select: { divisionId: true } } } }))?.matchup.divisionId;
    }
    if (options.kind === "MATCHUP" && options.targetId) {
      divisionId = (await prisma.matchup.findFirst({ where: { id: options.targetId, tournamentId: tournament.id }, select: { divisionId: true } }))?.divisionId;
    }
    if (!divisionId) return new NextResponse("Select one private Executive division. All-divisions simulation is blocked in production.", { status: 403 });
    const division = await prisma.division.findFirst({ where: { id: divisionId, tournamentId: tournament.id }, select: { id: true, slug: true, isPublic: true } });
    if (!division || !isProductionPrivateLabDivision(division)) return new NextResponse("Only private non-Team-Event divisions may be simulated in production.", { status: 403 });
    options.divisionId = division.id;
    options.scopeDivisionId = division.id;
    productionLabDivisionId = division.id;
  }
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
    const checkpoint = productionLabDivisionId ? null : await prisma.$transaction(async (tx) => {
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
      data: { status: "COMPLETED", result: jsonSafe({ ...result, checkpointId: checkpoint?.id ?? null, productionPrivateLab: Boolean(productionLabDivisionId) }), completedAt: new Date() },
    });
    if (
      options.kind === "FAN_VOTING" ||
      options.kind === "RESET_VOTING" ||
      (options.kind === "QUICK_SCENARIO" && ["FAN_CLOSE_RACE", "FAN_TIED_RANKINGS"].includes(options.targetId ?? ""))
    ) {
      invalidatePublicVotingCodeSnapshot(tournament.id);
    }
    return NextResponse.redirect(redirectBack(request, "/admin/simulation", { success: `Simulation completed (${run.id.slice(-6)}).` }), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simulation failed.";
    await prisma.simulationRun.update({ where: { id: run.id }, data: { status: "FAILED", error: message, completedAt: new Date() } });
    return NextResponse.redirect(redirectBack(request, "/admin/simulation", { error: message }), 303);
  }
}
