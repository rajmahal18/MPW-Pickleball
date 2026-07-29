import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { requestData, redirectBack } from "@/lib/request";
import { captureTournamentSnapshot } from "@/lib/tournament/snapshot";
import { rebuildActivityPreservingMasterData, factorySeed } from "@/lib/tournament/seed";
import { recalculateTournament } from "@/lib/tournament/recalculate";
import { writeAudit } from "@/lib/audit";

const confirmationByScope: Record<string, string> = {
  SCORES: "RESET SCORES",
  PROGRESS: "RESET PROGRESS",
  EVENT: "RESET EVENT",
  EXCEPT_USERS: "RESET EXCEPT USERS",
  FACTORY: "FACTORY RESET",
  VOTING: "RESET VOTING",
};

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const data = await requestData(request);
  const scope = String(data.scope || "");
  if (String(data.confirmation || "") !== confirmationByScope[scope]) {
    return NextResponse.redirect(redirectBack(request, "/admin/reset", { error: `Confirmation must be: ${confirmationByScope[scope] || "valid phrase"}` }), 303);
  }
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tournament) return new NextResponse("Tournament not found", { status: 404 });
  if (process.env.NODE_ENV === "production" && !tournament.destructiveToolsEnabled) {
    return new NextResponse("Destructive reset tools are disabled in production.", { status: 403 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (scope !== "FACTORY") {
        const snapshot = await captureTournamentSnapshot(tx, tournament.id);
        await tx.checkpoint.create({
          data: {
            tournamentId: tournament.id,
            name: `Before ${scope} reset · ${new Date().toISOString()}`,
            kind: "AUTOMATIC",
            snapshot,
            createdById: user.id,
          },
        });
      }

      if (scope === "SCORES") {
        await tx.scoreEvent.deleteMany({ where: { game: { matchup: { tournamentId: tournament.id } } } });
        await tx.game.updateMany({
          where: { matchup: { tournamentId: tournament.id } },
          data: { homeScore: 0, awayScore: 0, status: "SCHEDULED", winnerTeamId: null, startedAt: null, completedAt: null, version: { increment: 1 } },
        });
        await tx.matchup.updateMany({
          where: { tournamentId: tournament.id },
          data: { homeWins: 0, awayWins: 0, winnerTeamId: null, status: "READY", version: { increment: 1 } },
        });
        const withoutGames = await tx.matchup.findMany({ where: { tournamentId: tournament.id, games: { none: {} } }, select: { id: true, homeTeamId: true, awayTeamId: true } });
        for (const matchup of withoutGames) {
          await tx.matchup.update({
            where: { id: matchup.id },
            data: { status: matchup.homeTeamId && matchup.awayTeamId ? "LINEUP_PENDING" : "SCHEDULED" },
          });
        }
      } else if (scope === "PROGRESS") {
        await tx.scoreEvent.deleteMany({ where: { game: { matchup: { tournamentId: tournament.id } } } });
        await tx.game.updateMany({
          where: { matchup: { tournamentId: tournament.id, stage: "GROUP" } },
          data: { homeScore: 0, awayScore: 0, status: "SCHEDULED", winnerTeamId: null, startedAt: null, completedAt: null, version: { increment: 1 } },
        });
        await tx.matchup.updateMany({
          where: { tournamentId: tournament.id, stage: "GROUP" },
          data: { homeWins: 0, awayWins: 0, winnerTeamId: null, status: "READY", version: { increment: 1 } },
        });
        const groupWithoutGames = await tx.matchup.findMany({
          where: { tournamentId: tournament.id, stage: "GROUP", games: { none: {} } },
          include: { lineups: true },
        });
        for (const matchup of groupWithoutGames) {
          await tx.matchup.update({
            where: { id: matchup.id },
            data: {
              status: matchup.homeTeamId && matchup.awayTeamId
                ? matchup.lineups.length === 2 ? "READY" : "LINEUP_PENDING"
                : "SCHEDULED",
            },
          });
        }
        await tx.game.deleteMany({ where: { matchup: { tournamentId: tournament.id, stage: { in: ["SEMIFINAL", "FINAL"] } } } });
        await tx.lineup.deleteMany({ where: { matchup: { tournamentId: tournament.id, stage: { in: ["SEMIFINAL", "FINAL"] } } } });
        await tx.matchup.deleteMany({ where: { tournamentId: tournament.id, stage: { in: ["SEMIFINAL", "FINAL"] } } });
      } else if (scope === "EVENT") {
        await rebuildActivityPreservingMasterData(tx, tournament.id);
        await tx.fanVote.deleteMany({ where: { tournamentId: tournament.id } });
        await tx.votingCode.deleteMany({ where: { tournamentId: tournament.id } });
      } else if (scope === "EXCEPT_USERS") {
        await rebuildActivityPreservingMasterData(tx, tournament.id);
      } else if (scope === "VOTING") {
        await tx.fanVote.deleteMany({ where: { tournamentId: tournament.id } });
        await tx.votingCode.updateMany({
          where: { tournamentId: tournament.id, status: { in: ["USED", "ISSUED"] } },
          data: { status: "UNUSED", usedAt: null, issuedAt: null },
        });
        await tx.voteAttempt.deleteMany({ where: { tournamentId: tournament.id } });
      } else if (scope === "FACTORY") {
        if (process.env.ALLOW_FACTORY_RESET !== "true") throw new Error("Set ALLOW_FACTORY_RESET=true before using factory reset.");
        await factorySeed(tx);
        return;
      } else {
        throw new Error("Unknown reset scope.");
      }

      await recalculateTournament(tx, tournament.id, { actorId: user.id, reason: `${scope} reset` });
      await writeAudit(tx, {
        tournamentId: tournament.id,
        actorId: user.id,
        action: "RESET_EXECUTED",
        entityType: "Tournament",
        entityId: tournament.id,
        reason: scope,
        afterState: { scope },
      });
    }, { timeout: 60_000 });
    const success = scope === "FACTORY"
      ? "Factory reset completed. The previous database state cannot be restored from an in-database checkpoint."
      : `${scope} reset completed. A safety checkpoint was created first.`;
    return NextResponse.redirect(redirectBack(request, "/admin/reset", { success }), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reset failed.";
    return NextResponse.redirect(redirectBack(request, "/admin/reset", { error: message }), 303);
  }
}
