import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { requestData, redirectBack } from "@/lib/request";
import { generateVotingCode, hashVotingCode, parsePhilippineLocalDateTime, votingCodeHint } from "@/lib/tournament/voting";
import { writeAudit } from "@/lib/audit";
import { invalidatePublicVotingCodeSnapshot } from "@/lib/tournament/fan-favorite-codes";

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tournament) return new NextResponse("Tournament not found", { status: 404 });
  const data = await requestData(request);
  const action = String(data.action || "generate");

  try {
    if (action === "schedule-batch") {
      const requestedCount = Number(data.count || 100);
      if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 500) throw new Error("Public code batch size must be a whole number from 1 to 500.");
      const count = requestedCount;
      const releaseAt = parsePhilippineLocalDateTime(String(data.releaseAt || ""));
      if (releaseAt <= new Date()) throw new Error("Schedule the public code drop for a future time.");

      // Generate the whole drop before opening the transaction, then insert it in
      // one batch. This keeps 50/100-code drops fast even when Postgres is remote.
      const generated = new Map<string, string>();
      while (generated.size < count) {
        const plain = generateVotingCode();
        generated.set(hashVotingCode(plain), plain);
      }
      const existing = await prisma.votingCode.findMany({
        where: { codeHash: { in: [...generated.keys()] } },
        select: { codeHash: true },
      });
      for (const row of existing) generated.delete(row.codeHash);
      while (generated.size < count) {
        const plain = generateVotingCode();
        const codeHash = hashVotingCode(plain);
        if (generated.has(codeHash)) continue;
        const collision = await prisma.votingCode.findUnique({ where: { codeHash }, select: { id: true } });
        if (!collision) generated.set(codeHash, plain);
      }
      const publicCodes = [...generated.entries()].slice(0, count).map(([codeHash, plain]) => ({
        tournamentId: tournament.id,
        publicCode: plain,
        codeHash,
        codeHint: votingCodeHint(plain),
        status: "UNUSED" as const,
      }));

      await prisma.$transaction(async (tx) => {
        const batch = await tx.votingCodeBatch.create({
          data: { tournamentId: tournament.id, quantity: count, releaseAt },
        });
        await tx.votingCode.createMany({
          data: publicCodes.map((code) => ({ ...code, batchId: batch.id })),
        });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "VOTING_CODE_BATCH_SCHEDULED",
          entityType: "VotingCodeBatch",
          entityId: batch.id,
          afterState: { count, releaseAt: releaseAt.toISOString() },
        });
      }, { maxWait: 10_000, timeout: 30_000 });
      invalidatePublicVotingCodeSnapshot(tournament.id);
      return NextResponse.redirect(redirectBack(request, "/admin/voting", { success: `${count} public codes scheduled for release.` }), 303);
    }

    if (action === "release-batch-now" || action === "cancel-batch") {
      const batchId = String(data.batchId || "");
      const batch = await prisma.votingCodeBatch.findFirst({
        where: { id: batchId, tournamentId: tournament.id },
        include: { codes: { select: { id: true, status: true } } },
      });
      if (!batch) throw new Error("Voting-code batch not found.");
      if (batch.cancelledAt) throw new Error("This batch is already cancelled.");
      if (action === "release-batch-now") {
        if (batch.releaseAt <= new Date()) throw new Error("This batch has already been released.");
        const now = new Date();
        await prisma.$transaction(async (tx) => {
          await tx.votingCodeBatch.update({ where: { id: batch.id }, data: { releaseAt: now } });
          await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "VOTING_CODE_BATCH_RELEASED_NOW", entityType: "VotingCodeBatch", entityId: batch.id, afterState: { releaseAt: now.toISOString() } });
        });
        invalidatePublicVotingCodeSnapshot(tournament.id);
        return NextResponse.redirect(redirectBack(request, "/admin/voting", { success: "Code batch released." }), 303);
      }
      if (batch.releaseAt <= new Date() || batch.codes.some((code) => code.status === "USED")) throw new Error("Only an unreleased batch can be cancelled.");
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.votingCodeBatch.update({ where: { id: batch.id }, data: { cancelledAt: now } });
        await tx.votingCode.updateMany({ where: { batchId: batch.id, status: { in: ["UNUSED", "ISSUED"] } }, data: { status: "REVOKED", revokedAt: now } });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "VOTING_CODE_BATCH_CANCELLED", entityType: "VotingCodeBatch", entityId: batch.id });
      });
      invalidatePublicVotingCodeSnapshot(tournament.id);
      return NextResponse.redirect(redirectBack(request, "/admin/voting", { success: "Scheduled code batch cancelled." }), 303);
    }

    if (action === "generate") {
      const count = Math.min(Math.max(Number(data.count || 20), 1), 100);
      const issued = String(data.issued || "") === "on" || data.issued === true;
      const plainCodes: string[] = [];
      await prisma.$transaction(async (tx) => {
        for (let index = 0; index < count; index += 1) {
          let created = false;
          for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
            const plain = generateVotingCode();
            try {
              await tx.votingCode.create({
                data: {
                  tournamentId: tournament.id,
                  codeHash: hashVotingCode(plain),
                  codeHint: votingCodeHint(plain),
                  status: issued ? "ISSUED" : "UNUSED",
                  issuedAt: issued ? new Date() : null,
                },
              });
              plainCodes.push(plain);
              created = true;
            } catch (error: unknown) {
              const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
              if (code !== "P2002") throw error;
            }
          }
          if (!created) throw new Error("Unable to generate a unique voting code.");
        }
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "VOTING_CODES_GENERATED",
          entityType: "VotingCode",
          afterState: { count, issued },
        });
      });
      const token = Buffer.from(JSON.stringify({ codes: plainCodes, createdAt: new Date().toISOString() })).toString("base64url");
      return NextResponse.redirect(redirectBack(request, "/admin/voting", { print: token }), 303);
    }

    const codeId = String(data.codeId || "");
    const code = await prisma.votingCode.findFirst({ where: { id: codeId, tournamentId: tournament.id } });
    if (!code) throw new Error("Voting code not found.");

    if (action === "issue") {
      if (code.status !== "UNUSED") throw new Error("Only an unused code can be issued.");
      await prisma.$transaction(async (tx) => {
        await tx.votingCode.update({ where: { id: code.id }, data: { status: "ISSUED", issuedAt: new Date() } });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "VOTING_CODE_ISSUED", entityType: "VotingCode", entityId: code.id });
      });
    } else if (action === "revoke") {
      if (!(code.status === "UNUSED" || code.status === "ISSUED")) throw new Error("Only an unused or issued code can be revoked.");
      await prisma.$transaction(async (tx) => {
        await tx.votingCode.update({ where: { id: code.id }, data: { status: "REVOKED", revokedAt: new Date() } });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "VOTING_CODE_REVOKED", entityType: "VotingCode", entityId: code.id, reason: String(data.reason || "") || null });
      });
    } else if (action === "replace") {
      if (code.status === "USED" || code.status === "REPLACED") throw new Error("A used or already replaced code cannot be replaced.");
      let plain = "";
      await prisma.$transaction(async (tx) => {
        let replacement: { id: string } | null = null;
        for (let attempt = 0; attempt < 5 && !replacement; attempt += 1) {
          plain = generateVotingCode();
          try {
            replacement = await tx.votingCode.create({
              data: {
                tournamentId: tournament.id,
                codeHash: hashVotingCode(plain),
                codeHint: votingCodeHint(plain),
                batchId: code.batchId,
                publicCode: code.batchId ? plain : null,
                status: "ISSUED",
                issuedAt: new Date(),
              },
              select: { id: true },
            });
          } catch (error: unknown) {
            const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
            if (errorCode !== "P2002") throw error;
          }
        }
        if (!replacement) throw new Error("Unable to generate a unique replacement code.");
        await tx.votingCode.update({
          where: { id: code.id },
          data: {
            status: "REPLACED",
            replacedById: replacement.id,
            replacementReason: String(data.reason || "Replacement issued").trim().slice(0, 500),
          },
        });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "VOTING_CODE_REPLACED",
          entityType: "VotingCode",
          entityId: code.id,
          afterState: { replacementId: replacement.id },
        });
      });
      const token = Buffer.from(JSON.stringify({ codes: [plain], createdAt: new Date().toISOString() })).toString("base64url");
      if (code.batchId) invalidatePublicVotingCodeSnapshot(tournament.id);
      return NextResponse.redirect(redirectBack(request, "/admin/voting", { print: token }), 303);
    } else {
      throw new Error("Unsupported voting code action.");
    }
    return NextResponse.redirect(redirectBack(request, "/admin/voting", { success: "Voting code updated." }), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voting code action failed.";
    return NextResponse.redirect(redirectBack(request, "/admin/voting", { error: message }), 303);
  }
}
