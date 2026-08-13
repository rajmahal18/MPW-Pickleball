import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { assertSameOrigin, redirectBack } from "@/lib/request";
import { saveChampionImage } from "@/lib/avatar-storage";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  try {
    assertSameOrigin(request);
    const division = await prisma.division.findUnique({
      where: { id },
      include: { matchups: { where: { stage: "FINAL" }, select: { status: true, winnerTeamId: true } } },
    });
    if (!division) throw new Error("Division not found.");
    const championFinal = division.matchups.find((matchup) => matchup.winnerTeamId && (matchup.status === "COMPLETED" || matchup.status === "FORFEITED"));
    if (!championFinal) throw new Error("Champion photo upload becomes available after the Grand Final has an official winner.");

    const form = await request.formData();
    const file = form.get("championImage");
    if (!(file instanceof File)) throw new Error("Choose a champion image file.");
    const saved = await saveChampionImage(file);

    await prisma.$transaction(async (tx) => {
      await tx.division.update({ where: { id }, data: { championImageUrl: saved.url, championImageTeamId: championFinal.winnerTeamId } });
      await writeAudit(tx, {
        tournamentId: division.tournamentId,
        actorId: user.id,
        action: "DIVISION_CHAMPION_IMAGE_UPDATED",
        entityType: "Division",
        entityId: id,
        beforeState: { championImageUrl: division.championImageUrl, championImageTeamId: division.championImageTeamId },
        afterState: { championImageUrl: saved.url, championImageTeamId: championFinal.winnerTeamId },
      });
    });
    return NextResponse.redirect(redirectBack(request, `/admin/tournament?division=${id}`, { success: "Champion team photo uploaded." }), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Champion image upload failed.";
    return NextResponse.redirect(redirectBack(request, `/admin/tournament?division=${id}`, { error: message }), 303);
  }
}
