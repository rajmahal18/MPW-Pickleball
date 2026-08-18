import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/permissions";
import { assertSameOrigin, redirectBack, requestData } from "@/lib/request";
import { writeAudit } from "@/lib/audit";
import { formatPlayerDisplayName } from "@/lib/player-name";

function text(value: unknown, label: string, max = 80) {
  const cleaned = String(value || "").trim();
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > max) throw new Error(`${label} is too long.`);
  return cleaned;
}

function optionalText(value: unknown, max = 120) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return null;
  if (cleaned.length > max) throw new Error("Value is too long.");
  return cleaned;
}

function sex(value: unknown): "MALE" | "FEMALE" {
  if (value !== "MALE" && value !== "FEMALE") throw new Error("Select a valid sex category.");
  return value;
}

function participation(value: unknown): "POOL" | "CONFIRMED" | "UNAVAILABLE" | "WITHDRAWN" {
  if (!["POOL", "CONFIRMED", "UNAVAILABLE", "WITHDRAWN"].includes(String(value))) throw new Error("Select a valid participation status.");
  return value as "POOL" | "CONFIRMED" | "UNAVAILABLE" | "WITHDRAWN";
}

function employmentType(value: unknown): "PERMANENT" | "JOB_ORDER" | null {
  const cleaned = String(value || "").trim();
  if (!cleaned) return null;
  if (cleaned !== "PERMANENT" && cleaned !== "JOB_ORDER") throw new Error("Select a valid employment type.");
  return cleaned;
}

function stringList(value: unknown) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(values.map((item) => String(item).trim()).filter(Boolean)));
}

function divisionStatus(value: unknown): "ELIGIBLE" | "CONFIRMED" | "UNAVAILABLE" | "WITHDRAWN" {
  if (!["ELIGIBLE", "CONFIRMED", "UNAVAILABLE", "WITHDRAWN"].includes(String(value))) throw new Error("Select a valid division status.");
  return value as "ELIGIBLE" | "CONFIRMED" | "UNAVAILABLE" | "WITHDRAWN";
}

type DbClient = Prisma.TransactionClient | typeof prisma;

async function assertPlayerCanMove(playerId: string, db: DbClient = prisma) {
  const played = await db.game.findFirst({
    where: {
      status: { in: ["LIVE", "COMPLETED", "FORFEITED", "INTERRUPTED"] },
      OR: [
        { homePair: { playerAId: playerId } },
        { homePair: { playerBId: playerId } },
        { awayPair: { playerAId: playerId } },
        { awayPair: { playerBId: playerId } },
      ],
    },
    select: { id: true },
  });
  if (played) throw new Error("This player already has recorded play, so the historical team assignment is protected.");
}

async function assertPlayersCanMove(playerIds: string[], db: DbClient = prisma) {
  if (!playerIds.length) return;
  const played = await db.game.findFirst({
    where: {
      status: { in: ["LIVE", "COMPLETED", "FORFEITED", "INTERRUPTED"] },
      OR: [
        { homePair: { OR: [{ playerAId: { in: playerIds } }, { playerBId: { in: playerIds } }] } },
        { awayPair: { OR: [{ playerAId: { in: playerIds } }, { playerBId: { in: playerIds } }] } },
      ],
    },
    select: { id: true },
  });
  if (played) throw new Error("One or more selected players already have recorded play, so their historical team assignment is protected.");
}

async function releaseFuturePairingsForMove(playerIds: string[], db: DbClient = prisma) {
  for (const playerId of playerIds) await invalidateFuturePlayerUsage(playerId, db);
  await db.pair.updateMany({
    where: { isActive: true, OR: [{ playerAId: { in: playerIds } }, { playerBId: { in: playerIds } }] },
    data: { isActive: false },
  });
}


function divisionStatusForParticipation(status: "POOL" | "CONFIRMED" | "UNAVAILABLE" | "WITHDRAWN") {
  if (status === "CONFIRMED") return "CONFIRMED" as const;
  if (status === "UNAVAILABLE") return "UNAVAILABLE" as const;
  if (status === "WITHDRAWN") return "WITHDRAWN" as const;
  return "ELIGIBLE" as const;
}

async function invalidateFuturePlayerUsage(playerId: string, db: DbClient = prisma) {
  const slots = await db.lineupSlot.findMany({
    where: { pair: { OR: [{ playerAId: playerId }, { playerBId: playerId }] } },
    include: { lineup: { include: { matchup: { include: { games: true } } } } },
  });
  const affectedMatchupIds = new Set<string>();
  for (const slot of slots) {
    const matchup = slot.lineup.matchup;
    const game = matchup.games.find((row) => row.gameNumber === slot.slot);
    const recorded = game && (game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0);
    if (recorded || matchup.status === "COMPLETED" || matchup.status === "FORFEITED") continue;
    await db.lineupSlot.delete({ where: { id: slot.id } });
    affectedMatchupIds.add(matchup.id);
  }
  for (const matchupId of affectedMatchupIds) {
    const hasRecordedGame = await db.game.findFirst({ where: { matchupId, OR: [{ status: { not: "SCHEDULED" } }, { homeScore: { not: 0 } }, { awayScore: { not: 0 } }] }, select: { id: true } });
    if (!hasRecordedGame) await db.matchup.update({ where: { id: matchupId }, data: { status: "LINEUP_PENDING", version: { increment: 1 } } });
  }
}

async function invalidateFuturePairUsage(pairId: string, db: DbClient = prisma) {
  const slots = await db.lineupSlot.findMany({ where: { pairId }, include: { lineup: { include: { matchup: { include: { games: true } } } } } });
  const affectedMatchupIds = new Set<string>();
  for (const slot of slots) {
    const matchup = slot.lineup.matchup;
    const game = matchup.games.find((row) => row.gameNumber === slot.slot);
    const recorded = game && (game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0);
    if (recorded || matchup.status === "COMPLETED" || matchup.status === "FORFEITED") continue;
    await db.lineupSlot.delete({ where: { id: slot.id } });
    affectedMatchupIds.add(matchup.id);
  }
  for (const matchupId of affectedMatchupIds) {
    const hasRecordedGame = await db.game.findFirst({ where: { matchupId, OR: [{ status: { not: "SCHEDULED" } }, { homeScore: { not: 0 } }, { awayScore: { not: 0 } }] }, select: { id: true } });
    if (!hasRecordedGame) await db.matchup.update({ where: { id: matchupId }, data: { status: "LINEUP_PENDING", version: { increment: 1 } } });
  }
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  const user = await requireSuperadmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const data = await requestData(request);
    const action = String(data.action || "");
    const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
    if (!tournament) throw new Error("Tournament not found.");

    if (action === "batch-players") {
      const playerIds = stringList(data.playerIds);
      if (!playerIds.length) throw new Error("Select at least one player.");
      if (playerIds.length > 300) throw new Error("Too many players selected for one batch action.");

      const players = await prisma.player.findMany({
        where: { id: { in: playerIds }, tournamentId: tournament.id },
        select: { id: true, teamId: true, isActive: true, participationStatus: true, sex: true },
      });
      if (players.length !== playerIds.length) throw new Error("One or more selected players are invalid for this tournament.");

      const batchAction = String(data.batchAction || "");

      if (batchAction === "assign-team") {
        const teamId = text(data.teamId, "Destination team");
        const team = await prisma.team.findUnique({ where: { id: teamId }, include: { division: true } });
        if (!team || team.division.tournamentId !== tournament.id || team.division.entrantType !== "TEAM") throw new Error("Players can only be roster-assigned to a Team Event team.");
        if (players.some((player) => !player.isActive || player.participationStatus !== "CONFIRMED")) throw new Error("Batch team assignment only accepts active, confirmed players.");
        const movingIds = players.filter((player) => player.teamId !== teamId).map((player) => player.id);

        await prisma.$transaction(async (tx) => {
          await assertPlayersCanMove(movingIds, tx);
          await releaseFuturePairingsForMove(movingIds, tx);
          await tx.player.updateMany({ where: { id: { in: playerIds } }, data: { teamId } });
          await tx.divisionPlayer.updateMany({ where: { divisionId: team.divisionId, playerId: { in: playerIds } }, data: { status: "CONFIRMED" } });
          const existing = await tx.divisionPlayer.findMany({ where: { divisionId: team.divisionId, playerId: { in: playerIds } }, select: { playerId: true } });
          const existingIds = new Set(existing.map((entry) => entry.playerId));
          const missingIds = playerIds.filter((playerId) => !existingIds.has(playerId));
          if (missingIds.length) await tx.divisionPlayer.createMany({ data: missingIds.map((playerId) => ({ divisionId: team.divisionId, playerId, status: "CONFIRMED" as const })) });
          await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "PLAYER_BATCH_TEAM_ASSIGNED", entityType: "PlayerBatch", afterState: { playerIds, teamId, divisionId: team.divisionId } });
        });
        return NextResponse.redirect(redirectBack(request, "/admin/players", { success: `${playerIds.length} player${playerIds.length === 1 ? "" : "s"} assigned to ${team.shortName}.` }), 303);
      }

      if (batchAction === "unassign-team") {
        const movingIds = players.filter((player) => player.teamId).map((player) => player.id);
        await prisma.$transaction(async (tx) => {
          await assertPlayersCanMove(movingIds, tx);
          await releaseFuturePairingsForMove(movingIds, tx);
          await tx.player.updateMany({ where: { id: { in: playerIds } }, data: { teamId: null } });
          await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "PLAYER_BATCH_UNASSIGNED", entityType: "PlayerBatch", afterState: { playerIds } });
        });
        return NextResponse.redirect(redirectBack(request, "/admin/players", { success: `${playerIds.length} player${playerIds.length === 1 ? "" : "s"} returned to the player pool.` }), 303);
      }

      if (batchAction === "set-participation") {
        const nextStatus = participation(data.participationStatus);
        await prisma.$transaction(async (tx) => {
          if (nextStatus !== "CONFIRMED") {
            for (const player of players) {
              if (player.participationStatus === "CONFIRMED") await invalidateFuturePlayerUsage(player.id, tx);
            }
          }
          await tx.player.updateMany({ where: { id: { in: playerIds } }, data: { participationStatus: nextStatus } });
          await tx.divisionPlayer.updateMany({ where: { playerId: { in: playerIds } }, data: { status: divisionStatusForParticipation(nextStatus) } });
          await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "PLAYER_BATCH_PARTICIPATION_CHANGED", entityType: "PlayerBatch", afterState: { playerIds, participationStatus: nextStatus } });
        });
        return NextResponse.redirect(redirectBack(request, "/admin/players", { success: `${playerIds.length} player${playerIds.length === 1 ? "" : "s"} updated to ${nextStatus.replaceAll("_", " ")}.` }), 303);
      }

      if (batchAction === "set-division-status") {
        const divisionId = text(data.divisionId, "Division");
        const status = divisionStatus(data.divisionStatus);
        const division = await prisma.division.findUnique({ where: { id: divisionId } });
        if (!division || division.tournamentId !== tournament.id) throw new Error("Invalid division.");
        if (division.sexCategory && players.some((player) => player.sex !== division.sexCategory)) throw new Error(`${division.name} only accepts ${division.sexCategory === "MALE" ? "male" : "female"} players.`);

        await prisma.$transaction(async (tx) => {
          if (status !== "CONFIRMED") {
            const assignedTeamIds = players.map((player) => player.teamId).filter((teamId): teamId is string => Boolean(teamId));
            if (assignedTeamIds.length) {
              const teamsInDivision = await tx.team.findMany({ where: { id: { in: assignedTeamIds }, divisionId }, select: { id: true } });
              const teamIdsInDivision = new Set(teamsInDivision.map((team) => team.id));
              for (const player of players) if (player.teamId && teamIdsInDivision.has(player.teamId)) await invalidateFuturePlayerUsage(player.id, tx);
            }
          }
          await tx.divisionPlayer.updateMany({ where: { divisionId, playerId: { in: playerIds } }, data: { status } });
          const existing = await tx.divisionPlayer.findMany({ where: { divisionId, playerId: { in: playerIds } }, select: { playerId: true } });
          const existingIds = new Set(existing.map((entry) => entry.playerId));
          const missingIds = playerIds.filter((playerId) => !existingIds.has(playerId));
          if (missingIds.length) await tx.divisionPlayer.createMany({ data: missingIds.map((playerId) => ({ divisionId, playerId, status })) });
          if (status === "CONFIRMED") await tx.player.updateMany({ where: { id: { in: playerIds }, participationStatus: "POOL" }, data: { participationStatus: "CONFIRMED" } });
          await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "PLAYER_BATCH_DIVISION_STATUS_CHANGED", entityType: "PlayerBatch", afterState: { playerIds, divisionId, status } });
        });
        return NextResponse.redirect(redirectBack(request, "/admin/players", { success: `${playerIds.length} player${playerIds.length === 1 ? "" : "s"} updated for ${division.name}.` }), 303);
      }

      throw new Error("Select a valid batch action.");
    }

    if (action === "update-team") {
      const teamId = text(data.teamId, "Team ID");
      const before = await prisma.team.findUnique({ where: { id: teamId }, include: { division: true } });
      if (!before) throw new Error("Team not found.");
      const next = { name: text(data.name, "Team name", 100), shortName: text(data.shortName, "Short name", 20) };
      await prisma.$transaction(async (tx) => {
        const updated = await tx.team.update({ where: { id: teamId }, data: next });
        await writeAudit(tx, { tournamentId: before.division.tournamentId, actorId: user.id, action: "TEAM_MASTER_UPDATED", entityType: "Team", entityId: teamId, beforeState: { name: before.name, shortName: before.shortName }, afterState: { name: updated.name, shortName: updated.shortName } });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/players", { success: "Team updated." }), 303);
    }

    if (action === "create-pair-unit") {
      const divisionId = text(data.divisionId, "Division ID");
      const playerAId = text(data.playerAId, "Player A");
      const playerBId = text(data.playerBId, "Player B");
      if (playerAId === playerBId) throw new Error("Select two different players.");
      const [division, playerA, playerB] = await Promise.all([
        prisma.division.findUnique({ where: { id: divisionId } }),
        prisma.player.findUnique({ where: { id: playerAId } }),
        prisma.player.findUnique({ where: { id: playerBId } }),
      ]);
      if (!division || division.tournamentId !== tournament.id) throw new Error("Invalid division.");
      if (division.entrantType !== "PAIR") throw new Error("Executive pair entrants can only be created inside a Pair division.");
      for (const player of [playerA, playerB]) {
        if (!player || player.tournamentId !== tournament.id || !player.isActive || player.participationStatus !== "CONFIRMED") throw new Error("Both players must be active and confirmed.");
      }
      if (division.sexCategory && (playerA!.sex !== division.sexCategory || playerB!.sex !== division.sexCategory)) {
        throw new Error(`${division.name} accepts ${division.sexCategory === "MALE" ? "male" : "female"} players only.`);
      }
      const existingMembership = await prisma.pair.findFirst({
        where: {
          isActive: true,
          team: { divisionId },
          OR: [{ playerAId: { in: [playerAId, playerBId] } }, { playerBId: { in: [playerAId, playerBId] } }],
        },
      });
      if (existingMembership) throw new Error("One of these players is already in an active pair for this Executive event.");
      const compactName = (player: NonNullable<typeof playerA>) => player.displayName?.trim() || `${player.firstName} ${player.lastName}`.trim();
      const teamName = optionalText(data.name, 100) || `${compactName(playerA!)} / ${compactName(playerB!)}`;
      const shortName = optionalText(data.shortName, 20) || `${playerA!.lastName.slice(0, 3)}-${playerB!.lastName.slice(0, 3)}`.toUpperCase();
      const pairLabel = optionalText(data.label, 40) || "Executive Pair";
      const created = await prisma.$transaction(async (tx) => {
        const team = await tx.team.create({ data: { divisionId, groupId: null, name: teamName, shortName } });
        for (const playerId of [playerAId, playerBId]) {
          await tx.divisionPlayer.upsert({
            where: { divisionId_playerId: { divisionId, playerId } },
            update: { status: "CONFIRMED" },
            create: { divisionId, playerId, status: "CONFIRMED" },
          });
        }
        const pair = await tx.pair.create({ data: { teamId: team.id, label: pairLabel, playerAId, playerBId, isActive: true } });
        await writeAudit(tx, {
          tournamentId: tournament.id,
          actorId: user.id,
          action: "QUICK_PAIR_UNIT_CREATED",
          entityType: "Team",
          entityId: team.id,
          afterState: { divisionId, teamId: team.id, pairId: pair.id, playerAId, playerBId },
        });
        return team;
      });
      return NextResponse.redirect(redirectBack(request, "/admin/players", { success: `${created.name} created as an Executive pair entrant.` }), 303);
    }

    if (action === "create-player") {
      const requestedDivisionId = optionalText(data.divisionId);
      const teamId = optionalText(data.teamId);
      const playerSex = sex(data.sex);
      const team = teamId ? await prisma.team.findUnique({ where: { id: teamId }, include: { division: true } }) : null;
      if (teamId && (!team || team.division.tournamentId !== tournament.id || team.division.entrantType !== "TEAM")) throw new Error("Players can only be roster-assigned to a Team Event team.");
      if (requestedDivisionId) {
        const division = await prisma.division.findUnique({ where: { id: requestedDivisionId } });
        if (!division || division.tournamentId !== tournament.id) throw new Error("Invalid division selection.");
        if (division.sexCategory && division.sexCategory !== playerSex) throw new Error(`${division.name} only accepts ${division.sexCategory === "MALE" ? "male" : "female"} players.`);
        if (team && team.divisionId !== requestedDivisionId) throw new Error("Selected team does not belong to the selected division.");
      }
      const divisionId = team?.divisionId ?? requestedDivisionId;
      const status = participation(data.participationStatus || "POOL");
      const player = await prisma.$transaction(async (tx) => {
        const created = await tx.player.create({
          data: {
            firstName: text(data.firstName, "First name", 60),
            middleInitial: optionalText(data.middleInitial, 10),
            lastName: text(data.lastName, "Last name", 60),
            displayName: optionalText(data.displayName, 80),
            sex: playerSex,
            employmentType: employmentType(data.employmentType),
            office: optionalText(data.office, 120),
            tournamentId: tournament.id,
            teamId,
            participationStatus: status,
          },
        });
        if (divisionId) await tx.divisionPlayer.create({ data: { divisionId, playerId: created.id, status: divisionStatusForParticipation(status) } });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "PLAYER_CREATED", entityType: "Player", entityId: created.id, afterState: { teamId, divisionId, participationStatus: status } });
        return created;
      });
      return NextResponse.redirect(redirectBack(request, "/admin/players", { success: `${formatPlayerDisplayName(player)} added to the player pool.` }), 303);
    }

    if (action === "update-player") {
      const playerId = text(data.playerId, "Player ID");
      const before = await prisma.player.findUnique({ where: { id: playerId } });
      if (!before || before.tournamentId !== tournament.id) throw new Error("Player not found.");
      const nextTeamId = optionalText(data.teamId);
      const nextTeam = nextTeamId ? await prisma.team.findUnique({ where: { id: nextTeamId }, include: { division: true } }) : null;
      if (nextTeamId && (!nextTeam || nextTeam.division.tournamentId !== tournament.id || nextTeam.division.entrantType !== "TEAM")) throw new Error("Players can only be roster-assigned to a Team Event team.");
      const nextParticipationStatus = participation(data.participationStatus || before.participationStatus);
      const nextSex = sex(data.sex);
      if (nextSex !== before.sex) {
        const sexSpecificEntries = await prisma.divisionPlayer.findMany({ where: { playerId }, include: { division: { select: { name: true, sexCategory: true } } } });
        const incompatible = sexSpecificEntries.find((entry) => entry.division.sexCategory && entry.division.sexCategory !== nextSex);
        if (incompatible) throw new Error(`Remove this player from ${incompatible.division.name} before changing sex category.`);
      }
      const next = {
        firstName: text(data.firstName, "First name", 60),
        middleInitial: optionalText(data.middleInitial, 10),
        lastName: text(data.lastName, "Last name", 60),
        displayName: optionalText(data.displayName, 80),
        sex: nextSex,
        employmentType: employmentType(data.employmentType),
        office: optionalText(data.office, 120),
        isActive: data.isActive === "on",
        participationStatus: nextParticipationStatus,
        teamId: nextTeamId,
      };
      await prisma.$transaction(async (tx) => {
        if (nextTeamId !== before.teamId) {
          await assertPlayerCanMove(playerId, tx);
          await releaseFuturePairingsForMove([playerId], tx);
        } else if (before.participationStatus === "CONFIRMED" && nextParticipationStatus !== "CONFIRMED") {
          await invalidateFuturePlayerUsage(playerId, tx);
        }
        const updated = await tx.player.update({ where: { id: playerId }, data: next });
        if (nextTeam) {
          await tx.divisionPlayer.upsert({
            where: { divisionId_playerId: { divisionId: nextTeam.divisionId, playerId } },
            update: { status: divisionStatusForParticipation(nextParticipationStatus) },
            create: { divisionId: nextTeam.divisionId, playerId, status: divisionStatusForParticipation(nextParticipationStatus) },
          });
        }
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "PLAYER_MASTER_UPDATED", entityType: "Player", entityId: playerId, beforeState: { firstName: before.firstName, middleInitial: before.middleInitial, lastName: before.lastName, displayName: before.displayName, sex: before.sex, employmentType: before.employmentType, office: before.office, isActive: before.isActive, participationStatus: before.participationStatus, teamId: before.teamId }, afterState: { firstName: updated.firstName, middleInitial: updated.middleInitial, lastName: updated.lastName, displayName: updated.displayName, sex: updated.sex, employmentType: updated.employmentType, office: updated.office, isActive: updated.isActive, participationStatus: updated.participationStatus, teamId: updated.teamId } });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/players", { success: "Player updated." }), 303);
    }

    if (action === "set-division-status") {
      const playerId = text(data.playerId, "Player ID");
      const divisionId = text(data.divisionId, "Division ID");
      const status = divisionStatus(data.status);
      const [player, division] = await Promise.all([prisma.player.findUnique({ where: { id: playerId } }), prisma.division.findUnique({ where: { id: divisionId } })]);
      if (!player || player.tournamentId !== tournament.id || !division || division.tournamentId !== tournament.id) throw new Error("Invalid player/division selection.");
      if (division.sexCategory && player.sex !== division.sexCategory) throw new Error(`${division.name} only accepts ${division.sexCategory === "MALE" ? "male" : "female"} players.`);
      await prisma.$transaction(async (tx) => {
        if (status !== "CONFIRMED" && player.teamId) {
          const assignedTeam = await tx.team.findUnique({ where: { id: player.teamId } });
          if (assignedTeam?.divisionId === divisionId) await invalidateFuturePlayerUsage(playerId, tx);
        }
        await tx.divisionPlayer.upsert({ where: { divisionId_playerId: { divisionId, playerId } }, update: { status, notes: optionalText(data.notes, 200) }, create: { divisionId, playerId, status, notes: optionalText(data.notes, 200) } });
        if (status === "CONFIRMED" && player.participationStatus === "POOL") await tx.player.update({ where: { id: playerId }, data: { participationStatus: "CONFIRMED" } });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "PLAYER_DIVISION_STATUS_CHANGED", entityType: "DivisionPlayer", entityId: `${divisionId}:${playerId}`, afterState: { divisionId, playerId, status } });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/players", { success: "Division eligibility updated." }), 303);
    }

    if (action === "create-pair") {
      const teamId = text(data.teamId, "Team ID");
      const playerAId = text(data.playerAId, "Player A");
      const playerBId = text(data.playerBId, "Player B");
      if (playerAId === playerBId) throw new Error("Select two different players.");
      const [team, playerA, playerB] = await Promise.all([
        prisma.team.findUnique({ where: { id: teamId }, include: { division: true } }),
        prisma.player.findUnique({ where: { id: playerAId } }),
        prisma.player.findUnique({ where: { id: playerBId } }),
      ]);
      if (!team || team.division.tournamentId !== tournament.id || team.division.entrantType !== "TEAM" || !playerA || !playerB || playerA.teamId !== teamId || playerB.teamId !== teamId) throw new Error("Team Event playing pairs require two players already rostered to the same Team Event team.");
      if (playerA.participationStatus !== "CONFIRMED" || playerB.participationStatus !== "CONFIRMED") throw new Error("Both players must be confirmed before creating an active pair.");
      const confirmedEntries = await prisma.divisionPlayer.count({
        where: { divisionId: team.divisionId, playerId: { in: [playerAId, playerBId] }, status: "CONFIRMED" },
      });
      if (confirmedEntries !== 2) throw new Error("Both players must be confirmed for this division before creating an active pair.");
      const pair = await prisma.$transaction(async (tx) => {
        const created = await tx.pair.create({ data: { teamId, label: text(data.label, "Pair label", 40), playerAId, playerBId, isActive: true } });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "PAIR_CREATED", entityType: "Pair", entityId: created.id, afterState: { teamId, playerAId, playerBId, label: created.label } });
        return created;
      });
      return NextResponse.redirect(redirectBack(request, "/admin/players", { success: `${pair.label} created.` }), 303);
    }

    if (action === "deactivate-pair") {
      const pairId = text(data.pairId, "Pair ID");
      const pair = await prisma.pair.findUnique({ where: { id: pairId }, include: { team: { include: { division: true } } } });
      if (!pair || pair.team.division.tournamentId !== tournament.id) throw new Error("Pair not found.");
      await prisma.$transaction(async (tx) => {
        await invalidateFuturePairUsage(pairId, tx);
        await tx.pair.update({ where: { id: pairId }, data: { isActive: false } });
        await writeAudit(tx, { tournamentId: tournament.id, actorId: user.id, action: "PAIR_DEACTIVATED", entityType: "Pair", entityId: pairId, beforeState: { isActive: pair.isActive }, afterState: { isActive: false } });
      });
      return NextResponse.redirect(redirectBack(request, "/admin/players", { success: "Pair deactivated; future usages were reopened while recorded history was preserved." }), 303);
    }

    throw new Error("Unsupported master data action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed.";
    return NextResponse.redirect(redirectBack(request, "/admin/players", { error: message }), 303);
  }
}
