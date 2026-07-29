import { getCurrentUser } from "@/lib/auth";

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function requireTeamLeader() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEAM_LEADER" || !user.teamId) return null;
  return user;
}
