import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeamLeader } from "@/lib/permissions";
import { assertSameOrigin, redirectBack } from "@/lib/request";
import { writeAudit } from "@/lib/audit";

type LineupWithSlots = Prisma.LineupGetPayload<{ include: { slots: true } }>;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  assertSameOrigin(request);
  const user = await requireTeamLeader();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const teamId = user.teamId;
  if (!teamId) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const form = await request.formData();
  const pairIds = Array.from({ length: 7 }, (_, index) => String(form.get(`slot_${index + 1}`) || ""));

  if (pairIds.some((pairId) => !pairId) || new Set(pairIds).size !== 7) {
    return NextResponse.redirect(
      redirectBack(request, `/leader/matchups/${id}`, { error: "Each of the seven pairs must be used exactly once." }),
      303,
    );
  }

  const pairs = await prisma.pair.findMany({
    where: { id: { in: pairIds }, teamId, isActive: true },
    select: { id: true, playerAId: true, playerBId: true },
  });
  if (pairs.length !== 7) return new NextResponse("Invalid pair selection", { status: 400 });
  const playerIds = pairs.flatMap((pair) => [pair.playerAId, pair.playerBId]);
  if (new Set(playerIds).size !== 14) {
    return NextResponse.redirect(
      redirectBack(request, `/leader/matchups/${id}`, { error: "A player cannot appear twice in the same team matchup." }),
      303,
    );
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const matchup = await tx.matchup.findUnique({ where: { id }, include: { games: true } });
        if (!matchup || ![matchup.homeTeamId, matchup.awayTeamId].includes(teamId)) {
          throw new Error("You cannot manage this team matchup.");
        }
        if (matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0)) {
          throw new Error("The lineup is locked because scoring has started.");
        }

        const before = await tx.lineup.findUnique({
          where: { matchupId_teamId: { matchupId: id, teamId } },
          include: { slots: true },
        }) as LineupWithSlots | null;
        if (before) await tx.lineup.delete({ where: { id: before.id } });
        const lineup = await tx.lineup.create({
          data: {
            matchupId: id,
            teamId,
            slots: { create: pairIds.map((pairId, index) => ({ slot: index + 1, pairId })) },
          },
          include: { slots: true },
        });
        const lineups = await tx.lineup.findMany({ where: { matchupId: id }, include: { slots: true } }) as LineupWithSlots[];
        if (lineups.length === 2) {
          const home = lineups.find((entry) => entry.teamId === matchup.homeTeamId);
          const away = lineups.find((entry) => entry.teamId === matchup.awayTeamId);
          if (!home || !away || home.slots.length !== 7 || away.slots.length !== 7) {
            throw new Error("Both teams must submit complete seven-pair lineups.");
          }
          await tx.game.deleteMany({ where: { matchupId: id } });
          await tx.game.createMany({
            data: Array.from({ length: 7 }, (_, index) => ({
              matchupId: id,
              gameNumber: index + 1,
              homeTeamId: matchup.homeTeamId!,
              awayTeamId: matchup.awayTeamId!,
              homePairId: home.slots.find((slot) => slot.slot === index + 1)!.pairId,
              awayPairId: away.slots.find((slot) => slot.slot === index + 1)!.pairId,
            })),
          });
          await tx.matchup.update({ where: { id }, data: { status: "READY", version: { increment: 1 } } });
        } else {
          await tx.matchup.update({ where: { id }, data: { status: "LINEUP_PENDING", version: { increment: 1 } } });
        }
        await writeAudit(tx, {
          tournamentId: matchup.tournamentId,
          actorId: user.id,
          action: before ? "LINEUP_CHANGED" : "LINEUP_SUBMITTED",
          entityType: "Lineup",
          entityId: lineup.id,
          beforeState: before
            ? { pairIds: before.slots.sort((left, right) => left.slot - right.slot).map((slot) => slot.pairId) }
            : undefined,
          afterState: { pairIds },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.redirect(redirectBack(request, "/leader", { success: "Lineup saved." }), 303);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = code === "P2034"
      ? "The team matchup changed while you were submitting. Refresh and try again."
      : error instanceof Error
        ? error.message
        : "Lineup submission failed.";
    return NextResponse.redirect(redirectBack(request, `/leader/matchups/${id}`, { error: message }), 303);
  }
}
