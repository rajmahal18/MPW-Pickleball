import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { requestData, redirectBack } from "@/lib/request";
import { generateVotingCode, hashVotingCode, votingCodeHint } from "@/lib/tournament/voting";
import { writeAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tournament) return new NextResponse("Tournament not found", { status: 404 });
  const data = await requestData(request);
  const action = String(data.action || "generate");

  try {
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
