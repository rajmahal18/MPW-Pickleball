import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/permissions";
import { assertSameOrigin, redirectBack } from "@/lib/request";
import { removeManagedImage, saveTeamLogo } from "@/lib/avatar-storage";
import { extractTeamBranding } from "@/lib/team-branding-server";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  let newlySavedUrl: string | null = null;
  try {
    assertSameOrigin(request);
    const form = await request.formData();
    const file = form.get("logo");
    if (!(file instanceof File)) throw new Error("Choose a team logo file.");
    const team = await prisma.team.findUnique({ where: { id }, include: { division: true } });
    if (!team) throw new Error("Team not found.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved = await saveTeamLogo(file, bytes);
    newlySavedUrl = saved.url;
    let palette: Awaited<ReturnType<typeof extractTeamBranding>> | null = null;
    try { palette = await extractTeamBranding(bytes); } catch { /* A valid logo still saves with the safe MPW fallback. */ }
    await prisma.$transaction(async (tx) => {
      await tx.team.update({
        where: { id },
        data: {
          logoUrl: saved.url,
          brandingPrimary: palette?.brandingPrimary ?? null,
          brandingSecondary: palette?.brandingSecondary ?? null,
          brandingAccent: palette?.brandingAccent ?? null,
          brandingText: palette?.brandingText ?? null,
          brandingSurface: palette?.brandingSurface ?? null,
        },
      });
      await writeAudit(tx, {
        tournamentId: team.division.tournamentId,
        actorId: user.id,
        action: "TEAM_LOGO_UPDATED",
        entityType: "Team",
        entityId: id,
        beforeState: { logoUrl: team.logoUrl },
        afterState: { logoUrl: saved.url, brandingGenerated: Boolean(palette) },
      });
    });
    newlySavedUrl = null;
    if (team.logoUrl && team.logoUrl !== saved.url) await removeManagedImage(team.logoUrl);
    const message = palette ? "Team logo uploaded and branding generated." : "Team logo uploaded. Default MPW colors are being used because no safe palette could be derived.";
    return NextResponse.redirect(redirectBack(request, `/admin/tournament?division=${team.divisionId}`, { success: message }), 303);
  } catch (error) {
    if (newlySavedUrl) await removeManagedImage(newlySavedUrl);
    const message = error instanceof Error ? error.message : "Team logo upload failed.";
    return NextResponse.redirect(redirectBack(request, "/admin/tournament", { error: message }), 303);
  }
}
