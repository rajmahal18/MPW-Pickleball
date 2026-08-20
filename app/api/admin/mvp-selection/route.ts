import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/permissions";
import { assertSameOrigin, redirectBack, requestData } from "@/lib/request";
import { calculateMvpRankings, organizerSelectionTie } from "@/lib/tournament/mvp";
import { writeAudit } from "@/lib/audit";
import { isRecognitionDivision } from "@/lib/tournament/recognition-division";

export async function POST(request: Request) {
  assertSameOrigin(request);
  const user = await requireSuperadmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const data = await requestData(request);
    const divisionId = String(data.divisionId || "").trim();
    const sexCategory = String(data.sexCategory || "").trim();
    const action = String(data.action || "select").trim();
    if (!divisionId) throw new Error("Division is required.");
    if (sexCategory !== "MALE" && sexCategory !== "FEMALE") throw new Error("Invalid MVP category.");

    const division = await prisma.division.findUnique({ where: { id: divisionId }, select: { id: true, slug: true, entrantType: true, tournamentId: true, sexCategory: true } });
    if (!division) throw new Error("Division not found.");
    if (!isRecognitionDivision(division)) throw new Error("MVP recognition is not enabled for this division.");
    if (division.sexCategory && division.sexCategory !== sexCategory) throw new Error("That MVP category does not apply to this event.");

    if (action === "clear") {
      const before = await prisma.mvpSelection.findUnique({ where: { divisionId_sexCategory: { divisionId, sexCategory } } });
      await prisma.$transaction(async (tx) => {
        await tx.mvpSelection.deleteMany({ where: { divisionId, sexCategory } });
        await writeAudit(tx, { tournamentId: division.tournamentId, actorId: user.id, action: "MVP_ORGANIZER_SELECTION_CLEARED", entityType: "Division", entityId: divisionId, beforeState: before ? { playerId: before.playerId, sexCategory } : null });
      });
      return NextResponse.redirect(redirectBack(request, "/mvp", { division: division.slug, success: "Organizer MVP selection cleared." }), 303);
    }

    const playerId = String(data.playerId || "").trim();
    if (!playerId) throw new Error("Select one of the tied players.");

    const [games, matchups] = await Promise.all([
      prisma.game.findMany({
        where: { matchup: { divisionId }, status: { in: ["COMPLETED", "FORFEITED"] } },
        include: {
          matchup: { select: { stage: true } },
          homePair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
          awayPair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
        },
      }),
      prisma.matchup.findMany({ where: { divisionId }, select: { stage: true, homeTeamId: true, awayTeamId: true, winnerTeamId: true, status: true } }),
    ]);
    const rankings = calculateMvpRankings(games, matchups);
    const rows = sexCategory === "MALE" ? rankings.male : rankings.female;
    const tied = organizerSelectionTie(rows);
    if (tied.length !== 2) throw new Error("Organizer selection is only allowed when the current MVP lead is an exact locked-pair tie.");
    if (!tied.every((row) => row.eligible)) throw new Error("Organizer selection becomes available only after the tied players reach formal MVP eligibility.");
    if (!tied.some((row) => row.player.id === playerId)) throw new Error("The selected player is not part of the current locked-pair tie.");

    const before = await prisma.mvpSelection.findUnique({ where: { divisionId_sexCategory: { divisionId, sexCategory } } });
    await prisma.$transaction(async (tx) => {
      await tx.mvpSelection.upsert({
        where: { divisionId_sexCategory: { divisionId, sexCategory } },
        create: { tournamentId: division.tournamentId, divisionId, sexCategory, playerId, selectedById: user.id },
        update: { playerId, selectedById: user.id, selectedAt: new Date() },
      });
      await writeAudit(tx, { tournamentId: division.tournamentId, actorId: user.id, action: "MVP_ORGANIZER_SELECTED", entityType: "Player", entityId: playerId, beforeState: before ? { playerId: before.playerId } : null, afterState: { playerId, divisionId, sexCategory, reason: "locked-pair statistical tie" } });
    });

    return NextResponse.redirect(redirectBack(request, "/mvp", { division: division.slug, success: "MVP selected from the locked-pair tie." }), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save MVP selection.";
    return NextResponse.redirect(redirectBack(request, "/mvp", { error: message }), 303);
  }
}
