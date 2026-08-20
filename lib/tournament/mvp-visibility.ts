import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MVP_VISIBILITY_ACTION = "MVP_VISIBILITY_CHANGED";

export function mvpVisibilityFromState(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  return (value as Prisma.JsonObject).visible !== false;
}

export async function isMvpPublic(tournamentId: string) {
  const latest = await prisma.auditLog.findFirst({
    where: { tournamentId, action: MVP_VISIBILITY_ACTION, entityType: "Tournament" },
    select: { afterState: true },
    orderBy: { createdAt: "desc" },
  });
  return mvpVisibilityFromState(latest?.afterState);
}

export async function isPublishedTournamentMvpPublic() {
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, select: { id: true }, orderBy: { createdAt: "desc" } });
  return tournament ? isMvpPublic(tournament.id) : false;
}
