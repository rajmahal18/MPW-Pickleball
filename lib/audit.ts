import type { Prisma } from "@prisma/client";

type AuditInput = {
  tournamentId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: Prisma.InputJsonValue | null;
  afterState?: Prisma.InputJsonValue | null;
  reason?: string | null;
  simulation?: boolean;
  simulationRunId?: string | null;
};

export async function writeAudit(db: Prisma.TransactionClient, input: AuditInput) {
  return db.auditLog.create({
    data: {
      tournamentId: input.tournamentId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeState: input.beforeState ?? undefined,
      afterState: input.afterState ?? undefined,
      reason: input.reason ?? null,
      simulation: input.simulation ?? false,
      simulationRunId: input.simulationRunId ?? null,
    },
  });
}
