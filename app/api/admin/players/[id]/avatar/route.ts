import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { assertSameOrigin, redirectBack } from "@/lib/request";
import { saveAvatar } from "@/lib/avatar-storage";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  try {
    assertSameOrigin(request);
    const form = await request.formData();
    const file = form.get("avatar");
    if (!(file instanceof File)) throw new Error("Choose an image file.");
    const player = await prisma.player.findUnique({ where: { id },  });
    if (!player) throw new Error("Player not found.");
    const saved = await saveAvatar(file);
    await prisma.$transaction(async (tx) => {
      await tx.player.update({ where: { id }, data: { avatarUrl: saved.url } });
      await writeAudit(tx, {
        tournamentId: player.tournamentId,
        actorId: user.id,
        action: "PLAYER_AVATAR_UPDATED",
        entityType: "Player",
        entityId: id,
        beforeState: { avatarUrl: player.avatarUrl },
        afterState: { avatarUrl: saved.url },
      });
    });
    return NextResponse.redirect(redirectBack(request, "/admin/players", { success: "Avatar uploaded." }), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Avatar upload failed.";
    return NextResponse.redirect(redirectBack(request, "/admin/players", { error: message }), 303);
  }
}
