import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeamManager } from "@/lib/permissions";
import { assertSameOrigin, publicUrl, requestData, requestIp } from "@/lib/request";
import { writeAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashNetworkIdentifier } from "@/lib/tournament/voting";

function redirect(request: Request, key: "passwordSuccess" | "passwordError", message: string) {
  const url = publicUrl(request, "/leader");
  url.searchParams.set(key, message);
  url.hash = "account-security";
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch { return new NextResponse("Invalid request origin", { status: 403 }); }
  const actor = await requireTeamManager();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const data = await requestData(request);
    const currentPassword = String(data.currentPassword || "");
    const newPassword = String(data.newPassword || "");
    const confirmPassword = String(data.confirmPassword || "");
    if (!currentPassword) throw new Error("Enter your current password.");
    if (currentPassword.length > 200) throw new Error("Current password is too long.");
    if (newPassword.length < 8) throw new Error("New password must contain at least 8 characters.");
    if (newPassword.length > 200) throw new Error("New password is too long.");
    if (newPassword !== confirmPassword) throw new Error("New password and confirmation do not match.");

    const limiter = checkRateLimit(
      `password-change:${actor.id}:${hashNetworkIdentifier(requestIp(request))}`,
      10,
      5 * 60_000,
    );
    if (!limiter.allowed) throw new Error("Too many password attempts. Try again in a few minutes.");

    const account = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { passwordHash: true, team: { select: { division: { select: { tournamentId: true } } } } },
    });
    if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
      throw new Error("Current password is incorrect.");
    }
    if (await bcrypt.compare(newPassword, account.passwordHash)) {
      throw new Error("Choose a new password that is different from your current password.");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.id }, data: { passwordHash } });
      await writeAudit(tx, {
        tournamentId: account.team?.division.tournamentId ?? undefined,
        actorId: actor.id,
        action: "ACCOUNT_PASSWORD_CHANGED",
        entityType: "User",
        entityId: actor.id,
      });
    });
    return redirect(request, "passwordSuccess", "Password changed successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password change failed.";
    return redirect(request, "passwordError", message);
  }
}
