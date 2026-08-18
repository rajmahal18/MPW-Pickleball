import { getCurrentUser } from "@/lib/auth";

export async function requireOperator() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "SUPERADMIN" && user.role !== "ADMIN")) return null;
  return user;
}

// Backward-compatible name for operational score-control routes.
export const requireAdmin = requireOperator;

export async function requireSuperadmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SUPERADMIN") return null;
  return user;
}

export async function requireTeamManager() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEAM_MANAGER" || !user.teamId) return null;
  return user;
}

// Keep the old import name working internally while the visible product language is Team Manager.
export const requireTeamLeader = requireTeamManager;
