import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/permissions";
import { assertSameOrigin, requestData, redirectBack } from "@/lib/request";
import { writeAudit } from "@/lib/audit";

function text(value: unknown, label: string, max = 160) {
  const result = String(value || "").trim().slice(0, max);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function role(value: unknown) {
  if (value !== "ADMIN" && value !== "TEAM_MANAGER") throw new Error("Select a valid operational role.");
  return value;
}

export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch { return new NextResponse("Invalid request origin", { status: 403 }); }
  const actor = await requireSuperadmin();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  const data = await requestData(request);
  const action = String(data.action || "");
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!tournament) return new NextResponse("Tournament not found", { status: 404 });

  try {
    if (action === "create") {
      const selectedRole = role(data.role);
      const name = text(data.name, "Name");
      const email = text(data.email, "Email").toLowerCase();
      const password = text(data.password, "Password", 200);
      if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
      const teamId = selectedRole === "TEAM_MANAGER" ? text(data.teamId, "Assigned team") : null;
      if (teamId) {
        const team = await prisma.team.findFirst({ where: { id: teamId, division: { tournamentId: tournament.id, entrantType: "TEAM" } } });
        if (!team) throw new Error("Team Managers must be assigned to a valid Team Event team.");
      }
      const created = await prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 10), role: selectedRole, teamId } });
      await writeAudit(prisma, { tournamentId: tournament.id, actorId: actor.id, action: "ACCOUNT_CREATED", entityType: "User", entityId: created.id, afterState: { name, email, role: selectedRole, teamId } });
      return NextResponse.redirect(redirectBack(request, "/admin/accounts", { success: `${name} account created.` }), 303);
    }

    const userId = text(data.userId, "User ID");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new Error("Account not found.");
    if (action === "update") {
      if (target.id === actor.id && target.role === "SUPERADMIN") throw new Error("You cannot demote your own active Superadmin account.");
      const selectedRole = role(data.role);
      const teamId = selectedRole === "TEAM_MANAGER" ? text(data.teamId, "Assigned team") : null;
      if (teamId) {
        const team = await prisma.team.findFirst({ where: { id: teamId, division: { tournamentId: tournament.id, entrantType: "TEAM" } } });
        if (!team) throw new Error("Team Managers must be assigned to a valid Team Event team.");
      }
      await prisma.user.update({ where: { id: userId }, data: { role: selectedRole, teamId } });
      await writeAudit(prisma, { tournamentId: tournament.id, actorId: actor.id, action: "ACCOUNT_ROLE_UPDATED", entityType: "User", entityId: userId, beforeState: { role: target.role, teamId: target.teamId }, afterState: { role: selectedRole, teamId } });
      return NextResponse.redirect(redirectBack(request, "/admin/accounts", { success: "Account permissions updated." }), 303);
    }

    if (action === "password") {
      if (target.role === "SUPERADMIN") throw new Error("Superadmin password changes are not handled from this account-management screen.");
      const password = text(data.password, "Password", 200);
      if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
      await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 10) } });
      await writeAudit(prisma, { tournamentId: tournament.id, actorId: actor.id, action: "ACCOUNT_PASSWORD_RESET", entityType: "User", entityId: userId });
      return NextResponse.redirect(redirectBack(request, "/admin/accounts", { success: "Password reset." }), 303);
    }

    if (action === "delete") {
      if (target.role === "SUPERADMIN") throw new Error("Superadmin accounts cannot be removed here. Demote another legacy Superadmin first if needed.");
      await prisma.user.delete({ where: { id: userId } });
      await writeAudit(prisma, { tournamentId: tournament.id, actorId: actor.id, action: "ACCOUNT_REMOVED", entityType: "User", entityId: userId, beforeState: { name: target.name, email: target.email, role: target.role, teamId: target.teamId } });
      return NextResponse.redirect(redirectBack(request, "/admin/accounts", { success: "Account removed." }), 303);
    }

    throw new Error("Unsupported account action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account update failed.";
    return NextResponse.redirect(redirectBack(request, "/admin/accounts", { error: message }), 303);
  }
}
