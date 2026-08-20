import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/permissions";
import { requestData, redirectBack } from "@/lib/request";
import { writeAudit } from "@/lib/audit";
import { MVP_VISIBILITY_ACTION } from "@/lib/tournament/mvp-visibility";

export async function POST(request: Request) {
  const user = await requireSuperadmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tournament) return new NextResponse("Tournament not found", { status: 404 });
  const data = await requestData(request);
  const action = String(data.action || "");
  if (action === "hide-mvp" || action === "show-mvp") {
    const visible = action === "show-mvp";
    await writeAudit(prisma, {
      tournamentId: tournament.id,
      actorId: user.id,
      action: MVP_VISIBILITY_ACTION,
      entityType: "Tournament",
      entityId: tournament.id,
      afterState: { visible },
      reason: visible ? "Public MVP restored by organizer" : "Public MVP hidden by organizer",
    });
    return NextResponse.redirect(redirectBack(request, "/admin", { success: `Public MVP ${visible ? "shown" : "hidden"}.` }), 303);
  }
  const deadline = data.votingDeadline ? new Date(String(data.votingDeadline)) : null;
  const changes = action === "open-voting"
    ? { votingOpen: true, votingDeadline: deadline && !Number.isNaN(deadline.valueOf()) ? deadline : null }
    : action === "close-voting"
      ? { votingOpen: false }
      : action === "enable-simulation"
        ? { simulationMode: true }
        : action === "disable-simulation"
          ? { simulationMode: false }
          : action === "enable-destructive" && process.env.NODE_ENV !== "production"
            ? { destructiveToolsEnabled: true }
            : action === "disable-destructive"
              ? { destructiveToolsEnabled: false }
              : null;
  if (!changes) return new NextResponse("Unsupported or forbidden settings action.", { status: 400 });
  await prisma.$transaction(async (tx) => {
    await tx.tournament.update({ where: { id: tournament.id }, data: changes });
    await writeAudit(tx, {
      tournamentId: tournament.id,
      actorId: user.id,
      action: "TOURNAMENT_SETTINGS_CHANGED",
      entityType: "Tournament",
      entityId: tournament.id,
      beforeState: { action },
      afterState: changes,
    });
  });
  return NextResponse.redirect(redirectBack(request, "/admin", { success: "Tournament settings updated." }), 303);
}
