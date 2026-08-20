import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeamLeader } from "@/lib/permissions";
import { assertSameOrigin, redirectBack, requestData } from "@/lib/request";
import { writeAudit } from "@/lib/audit";
import { recalculateMatchup } from "@/lib/tournament/recalculate";
import { categoriesForStage, categoryLabel } from "@/lib/tournament/rules";
import { nextEditableTeamMatchupId } from "@/lib/tournament/leader-lineup-access";

type LineupWithSlots = Prisma.LineupGetPayload<{ include: { slots: true } }>;
type RequestedSlot = { playerAId: string; playerBId: string };

function wantsJson(request: Request) {
  return (request.headers.get("content-type") || "").includes("application/json")
    || (request.headers.get("accept") || "").includes("application/json");
}
function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}
function isRecorded(game: { status: string; homeScore: number; awayScore: number }) {
  return game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0;
}
function samePlayers(pair: { playerAId: string; playerBId: string }, slot: RequestedSlot) {
  return (pair.playerAId === slot.playerAId && pair.playerBId === slot.playerBId)
    || (pair.playerAId === slot.playerBId && pair.playerBId === slot.playerAId);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const asJson = wantsJson(request);
  try {
    assertSameOrigin(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request origin.";
    return asJson ? jsonError(message, 403) : new NextResponse(message, { status: 403 });
  }

  const user = await requireTeamLeader();
  if (!user?.teamId) return asJson ? jsonError("Unauthorized", 401) : new NextResponse("Unauthorized", { status: 401 });
  const teamId = user.teamId;
  const { id } = await params;
  const data = await requestData(request);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const matchup = await tx.matchup.findUnique({
        where: { id },
        include: {
          games: { orderBy: { gameNumber: "asc" } },
          lineups: { include: { slots: true } },
          division: true,
        },
      });
      if (!matchup || ![matchup.homeTeamId, matchup.awayTeamId].includes(teamId)) throw new Error("You cannot manage this team matchup.");
      if (!matchup.homeTeamId || !matchup.awayTeamId) throw new Error("This matchup does not have both teams assigned yet.");
      const submittedLineup = matchup.lineups.find((lineup) => lineup.teamId === teamId);
      if (submittedLineup) throw new Error("This lineup has already been submitted and can no longer be changed.");
      if (matchup.stage === "QUARTERFINAL" && (matchup.homeQualificationSource || matchup.awayQualificationSource)) {
        const [groupCount, unfinishedGroups] = await Promise.all([
          tx.matchup.count({ where: { divisionId: matchup.divisionId, stage: "GROUP" } }),
          tx.matchup.count({ where: { divisionId: matchup.divisionId, stage: "GROUP", status: { notIn: ["COMPLETED", "FORFEITED"] } } }),
        ]);
        if (groupCount === 0 || unfinishedGroups > 0) throw new Error("This Quarterfinal lineup opens after the group stage is complete.");
      }

      const teamSchedule = await tx.matchup.findMany({
        where: {
          tournamentId: matchup.tournamentId,
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        },
        select: { id: true, status: true, queuePosition: true, order: true, gamesPerMatchup: true, games: { select: { status: true } }, lineups: { where: { teamId }, select: { id: true } } },
      });
      const nextEditableId = nextEditableTeamMatchupId(teamSchedule.map((item) => ({
        ...item,
        lineupSubmitted: item.lineups.length > 0,
        decidedMatches: item.games.filter((game) => game.status === "COMPLETED" || game.status === "FORFEITED").length,
      })));
      if (nextEditableId !== matchup.id) {
        throw new Error(nextEditableId
          ? "Submit your earlier open lineup first."
          : "This lineup stays locked until the majority of your earlier matchup is decided and this matchup is queued.");
      }

      const required = Math.max(1, matchup.gamesPerMatchup);
      const rawSlots = Array.isArray(data.slots) ? data.slots : [];
      const requestedSlots: RequestedSlot[] = rawSlots.slice(0, required).map((slot) => {
        if (!slot || typeof slot !== "object") return { playerAId: "", playerBId: "" };
        const row = slot as Record<string, unknown>;
        return { playerAId: String(row.playerAId || ""), playerBId: String(row.playerBId || "") };
      });
      if (requestedSlots.length !== required || requestedSlots.some((slot) => !slot.playerAId || !slot.playerBId || slot.playerAId === slot.playerBId)) {
        throw new Error(`Select two different players for each of the ${required} matches.`);
      }

      const allPlayerIds = requestedSlots.flatMap((slot) => [slot.playerAId, slot.playerBId]);
      if (new Set(allPlayerIds).size !== required * 2) throw new Error("Each player can appear only once in this matchup lineup.");

      const side = teamId === matchup.homeTeamId ? "home" : "away";
      const recordedGames = matchup.games.filter(isRecorded);
      const lockedSlots = new Set(recordedGames.map((game) => game.gameNumber));
      const players = await tx.player.findMany({
        where: { id: { in: allPlayerIds } },
        include: { divisionEntries: { where: { divisionId: matchup.divisionId } } },
      });
      const categoryRules = categoriesForStage(matchup.division, matchup.stage, required);
      if (players.length !== allPlayerIds.length) throw new Error("One or more selected players could not be found.");
      const playerById = new Map(players.map((player) => [player.id, player]));

      for (let slotNumber = 1; slotNumber <= required; slotNumber += 1) {
        const slot = requestedSlots[slotNumber - 1]!;
        const game = matchup.games.find((item) => item.gameNumber === slotNumber);
        if (game && isRecorded(game)) {
          const recordedPairId = side === "home" ? game.homePairId : game.awayPairId;
          const recordedPair = await tx.pair.findUnique({ where: { id: recordedPairId }, select: { playerAId: true, playerBId: true } });
          if (!recordedPair || !samePlayers(recordedPair, slot)) throw new Error(`Match ${slotNumber} already started. Its recorded players cannot be changed.`);
          continue;
        }
        for (const playerId of [slot.playerAId, slot.playerBId]) {
          const player = playerById.get(playerId)!;
          const eligible = player.teamId === teamId
            && player.isActive
            && player.participationStatus === "CONFIRMED"
            && player.divisionEntries.some((entry) => entry.status === "CONFIRMED");
          if (!eligible) throw new Error(`A selected player in Match ${slotNumber} is no longer eligible for this team/division.`);
        }
        const category = categoryRules[slotNumber - 1] ?? null;
        if (category) {
          const playerA = playerById.get(slot.playerAId)!;
          const playerB = playerById.get(slot.playerBId)!;
          const validCategory = category === "MENS"
            ? playerA.sex === "MALE" && playerB.sex === "MALE"
            : category === "WOMENS"
              ? playerA.sex === "FEMALE" && playerB.sex === "FEMALE"
              : playerA.sex !== playerB.sex;
          if (!validCategory) throw new Error(`Match ${slotNumber} is configured as ${categoryLabel(category)}. Select a valid ${categoryLabel(category).toLowerCase()} pair.`);
        }
      }

      const existingPairs = await tx.pair.findMany({ where: { teamId, isActive: true }, select: { id: true, playerAId: true, playerBId: true } });
      const resolvedPairIds: string[] = [];
      for (let slotNumber = 1; slotNumber <= required; slotNumber += 1) {
        const slot = requestedSlots[slotNumber - 1]!;
        const game = matchup.games.find((item) => item.gameNumber === slotNumber);
        if (game && isRecorded(game)) {
          resolvedPairIds.push(side === "home" ? game.homePairId : game.awayPairId);
          continue;
        }
        const reusable = existingPairs.find((pair) => samePlayers(pair, slot));
        if (reusable) {
          resolvedPairIds.push(reusable.id);
          continue;
        }
        const created = await tx.pair.create({
          data: { teamId, label: `Lineup ${randomUUID().slice(0, 8)}`, playerAId: slot.playerAId, playerBId: slot.playerBId, isActive: true },
          select: { id: true, playerAId: true, playerBId: true },
        });
        existingPairs.push(created);
        resolvedPairIds.push(created.id);
      }

      if (lockedSlots.size) throw new Error("Recorded matches exist but this team's saved lineup is missing. Ask an admin to review the matchup before submitting.");
      const created = await tx.lineup.create({
        data: { matchupId: id, teamId, slots: { create: resolvedPairIds.map((pairId, index) => ({ slot: index + 1, pairId })) } },
      });
      const lineupId = created.id;

      const relevantLineups = await tx.lineup.findMany({
        where: { matchupId: id, teamId: { in: [matchup.homeTeamId, matchup.awayTeamId] } },
        include: { slots: true },
      }) as LineupWithSlots[];
      const home = relevantLineups.find((entry) => entry.teamId === matchup.homeTeamId);
      const away = relevantLineups.find((entry) => entry.teamId === matchup.awayTeamId);
      const bothComplete = Boolean(home && away && home.slots.length === required && away.slots.length === required);

      if (bothComplete && home && away) {
        const homeBySlot = new Map(home.slots.map((slot) => [slot.slot, slot.pairId]));
        const awayBySlot = new Map(away.slots.map((slot) => [slot.slot, slot.pairId]));
        if (matchup.games.length && matchup.games.length !== required) {
          if (recordedGames.length) throw new Error("The number of matches in this matchup changed after scoring began. Ask an admin to review it.");
          await tx.game.deleteMany({ where: { matchupId: id } });
        }
        const currentGames = matchup.games.length === required ? matchup.games : [];
        if (!currentGames.length) {
          await tx.game.createMany({
            data: Array.from({ length: required }, (_, index) => ({
              matchupId: id,
              gameNumber: index + 1,
              homeTeamId: matchup.homeTeamId!,
              awayTeamId: matchup.awayTeamId!,
              homePairId: homeBySlot.get(index + 1)!,
              awayPairId: awayBySlot.get(index + 1)!,
            })),
          });
        } else {
          for (const game of currentGames) {
            if (isRecorded(game)) continue;
            await tx.game.update({
              where: { id: game.id },
              data: { homePairId: homeBySlot.get(game.gameNumber)!, awayPairId: awayBySlot.get(game.gameNumber)!, version: { increment: 1 } },
            });
          }
        }
        if (recordedGames.length) await recalculateMatchup(tx, id);
        else await tx.matchup.update({ where: { id }, data: { status: "READY", version: { increment: 1 } } });
      } else if (!recordedGames.length) {
        await tx.matchup.update({ where: { id }, data: { status: "LINEUP_PENDING", version: { increment: 1 } } });
      }

      await writeAudit(tx, {
        tournamentId: matchup.tournamentId,
        actorId: user.id,
        action: "LINEUP_SUBMITTED",
        entityType: "Lineup",
        entityId: lineupId,
        afterState: {
          playersByGame: requestedSlots.map((slot, index) => ({ game: index + 1, playerAId: slot.playerAId, playerBId: slot.playerBId })),
          gamesPerMatchup: required,
          protectedSlots: [...lockedSlots].sort((a, b) => a - b),
        },
      });

      return { bothComplete, editable: required - lockedSlots.size, locked: lockedSlots.size };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });

    const message = result.locked
      ? `Lineup saved. ${result.locked} played match slot${result.locked === 1 ? " is" : "s are"} protected; ${result.editable} future slot${result.editable === 1 ? " remains" : "s remain"} editable.`
      : result.bothComplete
        ? "Lineup saved. Both teams are complete and the match cards are ready."
        : "Lineup saved. Waiting for the opposing team.";
    if (asJson) return NextResponse.json({ ok: true, message });
    return NextResponse.redirect(redirectBack(request, "/leader", { success: message }), 303);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = code === "P2034" ? "The matchup changed while you were submitting. Try again." : error instanceof Error ? error.message : "Lineup submission failed.";
    if (asJson) return jsonError(message, code === "P2034" ? 409 : 400);
    return NextResponse.redirect(redirectBack(request, `/leader/matchups/${id}`, { error: message }), 303);
  }
}
