import type { Prisma } from "@prisma/client";
import { gamesForStage } from "@/lib/tournament/rules";

function jsonSafe<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function captureTournamentSnapshot(db: Prisma.TransactionClient, tournamentId: string) {
  const [tournament, matchups, lineups, lineupSlots, games, scoreEvents, votingCodes, fanVotes, voteAttempts] = await Promise.all([
    db.tournament.findUniqueOrThrow({ where: { id: tournamentId } }),
    db.matchup.findMany({ where: { tournamentId }, orderBy: { order: "asc" } }),
    db.lineup.findMany({ where: { matchup: { tournamentId } } }),
    db.lineupSlot.findMany({ where: { lineup: { matchup: { tournamentId } } } }),
    db.game.findMany({ where: { matchup: { tournamentId } } }),
    db.scoreEvent.findMany({ where: { game: { matchup: { tournamentId } } }, orderBy: { createdAt: "asc" } }),
    db.votingCode.findMany({ where: { tournamentId } }),
    db.fanVote.findMany({ where: { tournamentId } }),
    db.voteAttempt.findMany({ where: { tournamentId }, orderBy: { createdAt: "asc" } }),
  ]);

  return jsonSafe({
    version: 4,
    capturedAt: new Date().toISOString(),
    tournament: {
      id: tournament.id,
      votingOpen: tournament.votingOpen,
      votingDeadline: tournament.votingDeadline,
      simulationMode: tournament.simulationMode,
      destructiveToolsEnabled: tournament.destructiveToolsEnabled,
      activeCourtCount: tournament.activeCourtCount,
    },
    matchups,
    lineups,
    lineupSlots,
    games,
    scoreEvents,
    votingCodes,
    fanVotes,
    voteAttempts,
  });
}

type Snapshot = {
  version: number;
  tournament: {
    id: string;
    votingOpen: boolean;
    votingDeadline: string | null;
    simulationMode: boolean;
    destructiveToolsEnabled: boolean;
    activeCourtCount?: number;
  };
  matchups: Array<Record<string, unknown>>;
  lineups: Array<Record<string, unknown>>;
  lineupSlots: Array<Record<string, unknown>>;
  games: Array<Record<string, unknown>>;
  scoreEvents?: Array<Record<string, unknown>>;
  votingCodes: Array<Record<string, unknown>>;
  fanVotes: Array<Record<string, unknown>>;
  voteAttempts?: Array<Record<string, unknown>>;
};

const MATCHUP_STAGES = ["GROUP", "ROUND_ROBIN", "QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE", "CUSTOM"] as const;
const MATCHUP_STATUSES = ["SCHEDULED", "LINEUP_PENDING", "READY", "LIVE", "COMPLETED", "FORFEITED", "INTERRUPTED"] as const;
const GAME_STATUSES = ["SCHEDULED", "LIVE", "COMPLETED", "FORFEITED", "INTERRUPTED"] as const;
const VOTING_CODE_STATUSES = ["UNUSED", "ISSUED", "USED", "REVOKED", "REPLACED"] as const;

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`Checkpoint contains an invalid ${label}.`);
  return value as T[number];
}

function asDate(value: unknown) {
  if (value === null || value === undefined) return null;
  const date = typeof value === "string" ? new Date(value) : value instanceof Date ? value : null;
  if (!date || Number.isNaN(date.valueOf())) throw new Error("Checkpoint contains an invalid date.");
  return date;
}

export async function restoreTournamentSnapshot(
  db: Prisma.TransactionClient,
  tournamentId: string,
  rawSnapshot: Prisma.JsonValue,
) {
  const snapshot = rawSnapshot as unknown as Snapshot;
  if (!snapshot || ![1, 2, 3, 4].includes(snapshot.version) || snapshot.tournament?.id !== tournamentId) {
    throw new Error("Checkpoint is incompatible with this tournament.");
  }

  await db.scoreEvent.deleteMany({ where: { game: { matchup: { tournamentId } } } });
  await db.game.deleteMany({ where: { matchup: { tournamentId } } });
  await db.lineup.deleteMany({ where: { matchup: { tournamentId } } });
  await db.matchup.deleteMany({ where: { tournamentId } });
  await db.fanVote.deleteMany({ where: { tournamentId } });
  await db.votingCode.deleteMany({ where: { tournamentId } });
  await db.voteAttempt.deleteMany({ where: { tournamentId } });

  await db.tournament.update({
    where: { id: tournamentId },
    data: {
      votingOpen: snapshot.tournament.votingOpen,
      votingDeadline: asDate(snapshot.tournament.votingDeadline),
      simulationMode: snapshot.tournament.simulationMode,
      destructiveToolsEnabled: snapshot.tournament.destructiveToolsEnabled,
      activeCourtCount: Number(snapshot.tournament.activeCourtCount ?? 0),
    },
  });

  const fallbackDivision = await db.division.findFirst({ where: { tournamentId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  if (!fallbackDivision) throw new Error("Checkpoint restore requires at least one tournament division.");

  for (const raw of snapshot.matchups) {
    const value = raw as Record<string, unknown>;
    const divisionId = typeof value.divisionId === "string" ? value.divisionId : fallbackDivision.id;
    const division = await db.division.findUnique({ where: { id: divisionId } });
    if (!division || division.tournamentId !== tournamentId) throw new Error("Checkpoint references an invalid division.");
    const referencedTeamIds = Array.from(new Set([value.homeTeamId, value.awayTeamId, value.winnerTeamId].filter((id): id is string => typeof id === "string" && Boolean(id))));
    if (referencedTeamIds.length) {
      const compatibleTeams = await db.team.count({ where: { id: { in: referencedTeamIds }, divisionId } });
      if (compatibleTeams !== referencedTeamIds.length) {
        throw new Error("Checkpoint restore stopped safely because a referenced team has moved to another division. Restore structural master data first or use a newer checkpoint.");
      }
    }
    await db.matchup.create({
      data: {
        id: String(value.id),
        tournamentId,
        divisionId,
        stage: enumValue(value.stage, MATCHUP_STAGES, "team matchup stage"),
        groupLabel: (value.groupLabel as string | null) ?? null,
        roundLabel: String(value.roundLabel),
        roundNumber: (value.roundNumber as number | null) ?? null,
        order: Number(value.order),
        gamesPerMatchup: Number(value.gamesPerMatchup ?? gamesForStage(division, enumValue(value.stage, MATCHUP_STAGES, "team matchup stage"))),
        homeTeamId: (value.homeTeamId as string | null) ?? null,
        awayTeamId: (value.awayTeamId as string | null) ?? null,
        status: enumValue(value.status, MATCHUP_STATUSES, "team matchup status"),
        scheduledAt: asDate(value.scheduledAt),
        courtLabel: (value.courtLabel as string | null) ?? null,
        queuePosition: value.queuePosition === null || value.queuePosition === undefined ? null : Number(value.queuePosition),
        winnerTeamId: (value.winnerTeamId as string | null) ?? null,
        homeWins: Number(value.homeWins ?? 0),
        awayWins: Number(value.awayWins ?? 0),
        version: Number(value.version ?? 0),
      },
    });
  }

  for (const raw of snapshot.lineups) {
    const value = raw as Record<string, unknown>;
    await db.lineup.create({
      data: {
        id: String(value.id),
        matchupId: String(value.matchupId),
        teamId: String(value.teamId),
        submittedAt: asDate(value.submittedAt) ?? new Date(),
      },
    });
  }
  for (const raw of snapshot.lineupSlots) {
    const value = raw as Record<string, unknown>;
    await db.lineupSlot.create({
      data: {
        id: String(value.id),
        lineupId: String(value.lineupId),
        slot: Number(value.slot),
        pairId: String(value.pairId),
      },
    });
  }
  for (const raw of snapshot.games) {
    const value = raw as Record<string, unknown>;
    await db.game.create({
      data: {
        id: String(value.id),
        matchupId: String(value.matchupId),
        gameNumber: Number(value.gameNumber),
        homeTeamId: String(value.homeTeamId),
        awayTeamId: String(value.awayTeamId),
        homePairId: String(value.homePairId),
        awayPairId: String(value.awayPairId),
        homeScore: Number(value.homeScore ?? 0),
        awayScore: Number(value.awayScore ?? 0),
        status: enumValue(value.status, GAME_STATUSES, "match status"),
        winnerTeamId: (value.winnerTeamId as string | null) ?? null,
        version: Number(value.version ?? 0),
        startedAt: asDate(value.startedAt),
        completedAt: asDate(value.completedAt),
      },
    });
  }
  for (const raw of snapshot.scoreEvents ?? []) {
    const value = raw as Record<string, unknown>;
    await db.scoreEvent.create({
      data: {
        id: String(value.id),
        gameId: String(value.gameId),
        actorId: (value.actorId as string | null) ?? null,
        simulationRunId: (value.simulationRunId as string | null) ?? null,
        action: String(value.action),
        beforeState: value.beforeState as Prisma.InputJsonValue,
        afterState: value.afterState as Prisma.InputJsonValue,
        reason: (value.reason as string | null) ?? null,
        undoneAt: asDate(value.undoneAt),
        createdAt: asDate(value.createdAt) ?? new Date(),
      },
    });
  }
  for (const raw of snapshot.votingCodes) {
    const value = raw as Record<string, unknown>;
    await db.votingCode.create({
      data: {
        id: String(value.id),
        tournamentId,
        codeHash: String(value.codeHash),
        codeHint: String(value.codeHint),
        status: enumValue(value.status, VOTING_CODE_STATUSES, "voting code status"),
        issuedAt: asDate(value.issuedAt),
        usedAt: asDate(value.usedAt),
        revokedAt: asDate(value.revokedAt),
        replacementReason: (value.replacementReason as string | null) ?? null,
        replacedById: null,
        createdAt: asDate(value.createdAt) ?? new Date(),
      },
    });
  }
  for (const raw of snapshot.votingCodes) {
    const value = raw as Record<string, unknown>;
    const replacedById = (value.replacedById as string | null) ?? null;
    if (replacedById) await db.votingCode.update({ where: { id: String(value.id) }, data: { replacedById } });
  }
  for (const raw of snapshot.fanVotes) {
    const value = raw as Record<string, unknown>;
    await db.fanVote.create({
      data: {
        id: String(value.id),
        tournamentId,
        votingCodeId: String(value.votingCodeId),
        sexCategory: enumValue(value.sexCategory ?? "MALE", ["MALE", "FEMALE"] as const, "Fan Favorite vote category"),
        playerId: String(value.playerId),
        createdAt: asDate(value.createdAt) ?? new Date(),
      },
    });
  }
  for (const raw of snapshot.voteAttempts ?? []) {
    const value = raw as Record<string, unknown>;
    await db.voteAttempt.create({
      data: {
        id: String(value.id),
        tournamentId,
        ipHash: String(value.ipHash),
        codeHint: (value.codeHint as string | null) ?? null,
        success: Boolean(value.success),
        reason: (value.reason as string | null) ?? null,
        createdAt: asDate(value.createdAt) ?? new Date(),
      },
    });
  }
}
