import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { requestData, redirectBack } from "@/lib/request";
import { captureTournamentSnapshot, restoreTournamentSnapshot } from "@/lib/tournament/snapshot";
import { writeAudit } from "@/lib/audit";
import { recalculateTournament } from "@/lib/tournament/recalculate";

const LONG_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const data = await requestData(request);
  const action = String(data.action || "create");
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tournament) return new NextResponse("Tournament not found", { status: 404 });

  try {
    if (action === "create") {
      const name = String(data.name || "Manual checkpoint").trim().slice(0, 80);
      await prisma.$transaction(async (tx) => {
        const snapshot = await captureTournamentSnapshot(tx, tournament.id);
        const checkpoint = await tx.checkpoint.create({
          data: { tournamentId: tournament.id, name, snapshot, createdById: user.id, kind: "MANUAL" },
        });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "CHECKPOINT_CREATED",
          entityType: "Checkpoint",
          entityId: checkpoint.id,
          afterState: { name },
        });
      }, LONG_TRANSACTION_OPTIONS);
      return NextResponse.redirect(redirectBack(request, "/admin/checkpoints", { success: "Checkpoint created." }), 303);
    }

    if (action === "restore") {
      if (String(data.confirmation || "") !== "RESTORE") throw new Error('Type "RESTORE" to confirm.');
      const checkpointId = String(data.checkpointId || "");
      await prisma.$transaction(async (tx) => {
        const checkpoint = await tx.checkpoint.findFirst({ where: { id: checkpointId, tournamentId: tournament.id } });
        if (!checkpoint) throw new Error("Checkpoint not found.");
        const safetySnapshot = await captureTournamentSnapshot(tx, tournament.id);
        await tx.checkpoint.create({
          data: {
            tournamentId: tournament.id,
            name: `Automatic backup before restore · ${new Date().toISOString()}`,
            kind: "AUTOMATIC",
            snapshot: safetySnapshot,
            createdById: user.id,
          },
        });
        await restoreTournamentSnapshot(tx, tournament.id, checkpoint.snapshot);
        await recalculateTournament(tx, tournament.id, { actorId: user.id, reason: "Checkpoint restore" });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "CHECKPOINT_RESTORED",
          entityType: "Checkpoint",
          entityId: checkpoint.id,
          reason: checkpoint.name,
        });
      }, LONG_TRANSACTION_OPTIONS);
      return NextResponse.redirect(redirectBack(request, "/admin/checkpoints", { success: "Checkpoint restored and dependencies recalculated." }), 303);
    }

    throw new Error("Unsupported checkpoint action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkpoint action failed.";
    return NextResponse.redirect(redirectBack(request, "/admin/checkpoints", { error: message }), 303);
  }
}
