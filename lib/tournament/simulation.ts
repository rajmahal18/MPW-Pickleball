import type { Prisma } from "@prisma/client";
import { generateVotingCode, hashVotingCode, votingCodeHint } from "@/lib/tournament/voting";
import { createSeededRandom, pickOne, randomInteger } from "@/lib/tournament/rng";
import { recalculateTournament } from "@/lib/tournament/recalculate";
import { writeAudit } from "@/lib/audit";

export type SimulationOptions = {
  kind: string;
  seed: string;
  targetId?: string;
  winner?: "HOME" | "AWAY" | "RANDOM";
  scoreStyle?: "RANDOM" | "DOMINANT" | "CLOSE" | "DEUCE";
  matchupOutcome?: "RANDOM" | "HOME" | "AWAY" | "SWEEP_HOME" | "SWEEP_AWAY" | "CLOSE_HOME" | "CLOSE_AWAY";
  count?: number;
  selectedPlayerId?: string;
  selectedWeight?: number;
};

function simulationScore(
  random: () => number,
  winner: "HOME" | "AWAY",
  style: SimulationOptions["scoreStyle"] = "RANDOM",
) {
  let winnerScore = 11;
  let loserScore = randomInteger(random, 3, 9);
  if (style === "DOMINANT") loserScore = randomInteger(random, 0, 4);
  if (style === "CLOSE") loserScore = randomInteger(random, 8, 9);
  if (style === "DEUCE") {
    loserScore = randomInteger(random, 10, 14);
    winnerScore = loserScore + 2;
  }
  if (style === "RANDOM" && random() > 0.85) {
    loserScore = randomInteger(random, 10, 13);
    winnerScore = loserScore + 2;
  }
  return winner === "HOME"
    ? { homeScore: winnerScore, awayScore: loserScore }
    : { homeScore: loserScore, awayScore: winnerScore };
}

async function ensureGames(db: Prisma.TransactionClient, matchupId: string) {
  const matchup = await db.matchup.findUnique({
    where: { id: matchupId },
    include: { games: true, lineups: { include: { slots: true } } },
  });
  if (!matchup?.homeTeamId || !matchup.awayTeamId) throw new Error("Team matchup does not have two assigned teams.");
  if (matchup.games.length === 7) return matchup.games.sort((a, b) => a.gameNumber - b.gameNumber);

  const [homePairs, awayPairs] = await Promise.all([
    db.pair.findMany({ where: { teamId: matchup.homeTeamId, isActive: true }, orderBy: { label: "asc" }, take: 7 }),
    db.pair.findMany({ where: { teamId: matchup.awayTeamId, isActive: true }, orderBy: { label: "asc" }, take: 7 }),
  ]);
  if (homePairs.length !== 7 || awayPairs.length !== 7) throw new Error("Both teams need seven active pairs.");

  await db.game.deleteMany({ where: { matchupId } });
  await db.lineup.deleteMany({ where: { matchupId } });
  await db.lineup.create({
    data: {
      matchupId,
      teamId: matchup.homeTeamId,
      slots: { create: homePairs.map((pair, index) => ({ slot: index + 1, pairId: pair.id })) },
    },
  });
  await db.lineup.create({
    data: {
      matchupId,
      teamId: matchup.awayTeamId,
      slots: { create: awayPairs.map((pair, index) => ({ slot: index + 1, pairId: pair.id })) },
    },
  });
  await db.game.createMany({
    data: homePairs.map((homePair, index) => ({
      matchupId,
      gameNumber: index + 1,
      homeTeamId: matchup.homeTeamId!,
      awayTeamId: matchup.awayTeamId!,
      homePairId: homePair.id,
      awayPairId: awayPairs[index]!.id,
    })),
  });
  await db.matchup.update({ where: { id: matchupId }, data: { status: "READY" } });
  return db.game.findMany({ where: { matchupId }, orderBy: { gameNumber: "asc" } });
}

async function completeGame(
  db: Prisma.TransactionClient,
  gameId: string,
  score: { homeScore: number; awayScore: number },
  actorId: string,
  simulationRunId: string,
) {
  const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
  const winnerTeamId = score.homeScore > score.awayScore ? game.homeTeamId : game.awayTeamId;
  const after = {
    homeScore: score.homeScore,
    awayScore: score.awayScore,
    status: "COMPLETED" as const,
    winnerTeamId,
    startedAt: game.startedAt ?? new Date(),
    completedAt: new Date(),
  };
  await db.scoreEvent.create({
    data: {
      gameId,
      actorId,
      simulationRunId,
      action: "SIMULATE_GAME",
      beforeState: {
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        status: game.status,
        winnerTeamId: game.winnerTeamId,
      },
      afterState: after,
    },
  });
  await db.game.update({ where: { id: gameId }, data: { ...after, version: { increment: 1 } } });
}

async function recordGameState(
  db: Prisma.TransactionClient,
  gameId: string,
  after: {
    homeScore: number;
    awayScore: number;
    status: "COMPLETED" | "FORFEITED" | "INTERRUPTED";
    winnerTeamId: string | null;
    startedAt: Date;
    completedAt: Date | null;
  },
  actorId: string,
  simulationRunId: string,
  action: string,
  reason?: string,
) {
  const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
  await db.scoreEvent.create({
    data: {
      gameId,
      actorId,
      simulationRunId,
      action,
      reason,
      beforeState: {
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        status: game.status,
        winnerTeamId: game.winnerTeamId,
        startedAt: game.startedAt,
        completedAt: game.completedAt,
      },
      afterState: after,
    },
  });
  await db.game.update({ where: { id: gameId }, data: { ...after, version: { increment: 1 } } });
}

async function resetScenarioState(db: Prisma.TransactionClient, tournamentId: string) {
  await db.scoreEvent.deleteMany({ where: { game: { matchup: { tournamentId } } } });
  await db.game.deleteMany({ where: { matchup: { tournamentId } } });
  await db.lineup.deleteMany({ where: { matchup: { tournamentId } } });
  await db.matchup.updateMany({
    where: { tournamentId, stage: "GROUP" },
    data: { status: "LINEUP_PENDING", homeWins: 0, awayWins: 0, winnerTeamId: null, version: { increment: 1 } },
  });
}

function outcomeForWinner(
  matchup: { homeTeamId: string | null; awayTeamId: string | null },
  winnerTeamId: string,
  style: "CLOSE" | "SWEEP" = "CLOSE",
): SimulationOptions["matchupOutcome"] {
  if (matchup.homeTeamId === winnerTeamId) return style === "SWEEP" ? "SWEEP_HOME" : "CLOSE_HOME";
  if (matchup.awayTeamId === winnerTeamId) return style === "SWEEP" ? "SWEEP_AWAY" : "CLOSE_AWAY";
  throw new Error("Selected winner is not assigned to this team matchup.");
}

async function simulateGroupPattern(
  db: Prisma.TransactionClient,
  tournamentId: string,
  pattern: "THREE_WAY_TIE" | "WILDCARD",
  options: SimulationOptions,
  random: () => number,
  actorId: string,
  simulationRunId: string,
) {
  await resetScenarioState(db, tournamentId);
  const groups = await db.group.findMany({
    where: { tournamentId },
    include: { teams: { orderBy: { shortName: "asc" } } },
    orderBy: { name: "asc" },
  });
  const groupMatchups = await db.matchup.findMany({ where: { tournamentId, stage: "GROUP" }, orderBy: { order: "asc" } });
  const findMatchup = (first: string, second: string) => {
    const found = groupMatchups.find((matchup) =>
      (matchup.homeTeamId === first && matchup.awayTeamId === second) ||
      (matchup.homeTeamId === second && matchup.awayTeamId === first));
    if (!found) throw new Error("Expected group team matchup is missing.");
    return found;
  };

  const groupsToRun = pattern === "THREE_WAY_TIE" ? groups.slice(0, 1) : groups;
  for (const [groupIndex, group] of groupsToRun.entries()) {
    const [first, second, third, fourth] = group.teams;
    if (!first || !second || !third || !fourth) throw new Error(`${group.name} must have four teams.`);
    const plan: Array<{ a: string; b: string; winner: string; style: "CLOSE" | "SWEEP" }> = pattern === "THREE_WAY_TIE"
      ? [
          { a: first.id, b: second.id, winner: first.id, style: "CLOSE" },
          { a: second.id, b: third.id, winner: second.id, style: "CLOSE" },
          { a: third.id, b: first.id, winner: third.id, style: "CLOSE" },
          { a: first.id, b: fourth.id, winner: first.id, style: "SWEEP" },
          { a: second.id, b: fourth.id, winner: second.id, style: "SWEEP" },
          { a: third.id, b: fourth.id, winner: third.id, style: "SWEEP" },
        ]
      : [
          { a: first.id, b: second.id, winner: first.id, style: groupIndex === 0 ? "SWEEP" : "CLOSE" },
          { a: first.id, b: third.id, winner: first.id, style: "CLOSE" },
          { a: first.id, b: fourth.id, winner: first.id, style: "CLOSE" },
          { a: second.id, b: third.id, winner: second.id, style: groupIndex === 1 ? "SWEEP" : "CLOSE" },
          { a: second.id, b: fourth.id, winner: second.id, style: groupIndex === 1 ? "SWEEP" : "CLOSE" },
          { a: third.id, b: fourth.id, winner: third.id, style: "CLOSE" },
        ];
    for (const item of plan) {
      const matchup = findMatchup(item.a, item.b);
      await simulateOneMatchup(
        db,
        matchup.id,
        { ...options, matchupOutcome: outcomeForWinner(matchup, item.winner, item.style), scoreStyle: item.style === "SWEEP" ? "DOMINANT" : "CLOSE" },
        random,
        actorId,
        simulationRunId,
      );
    }
  }
  await recalculateTournament(db, tournamentId, { actorId, simulationRunId, reason: pattern });
}

async function simulateVotingAttemptScenario(
  db: Prisma.TransactionClient,
  tournamentId: string,
  kind: "REUSED" | "REVOKED",
  count: number,
) {
  const player = await db.player.findFirstOrThrow({ where: { isActive: true, team: { group: { tournamentId } } } });
  for (let index = 0; index < count; index += 1) {
    const plain = generateVotingCode();
    const code = await db.votingCode.create({
      data: {
        tournamentId,
        codeHash: hashVotingCode(plain),
        codeHint: votingCodeHint(plain),
        status: kind === "REUSED" ? "USED" : "REVOKED",
        issuedAt: new Date(),
        usedAt: kind === "REUSED" ? new Date() : null,
        revokedAt: kind === "REVOKED" ? new Date() : null,
      },
    });
    if (kind === "REUSED") await db.fanVote.create({ data: { tournamentId, votingCodeId: code.id, playerId: player.id } });
    await db.voteAttempt.create({
      data: {
        tournamentId,
        ipHash: `simulation-${kind.toLowerCase()}-${index % 5}`,
        codeHint: code.codeHint,
        success: false,
        reason: kind === "REUSED" ? "REUSED_CODE" : "REVOKED_CODE",
      },
    });
  }
}

async function simulateOneMatchup(
  db: Prisma.TransactionClient,
  matchupId: string,
  options: SimulationOptions,
  random: () => number,
  actorId: string,
  simulationRunId: string,
) {
  const games = await ensureGames(db, matchupId);
  const outcome = options.matchupOutcome ?? "RANDOM";
  let homeWinsTarget = 0;
  if (outcome === "SWEEP_HOME") homeWinsTarget = 7;
  else if (outcome === "SWEEP_AWAY") homeWinsTarget = 0;
  else if (outcome === "CLOSE_HOME") homeWinsTarget = 4;
  else if (outcome === "CLOSE_AWAY") homeWinsTarget = 3;
  else if (outcome === "HOME") homeWinsTarget = randomInteger(random, 4, 7);
  else if (outcome === "AWAY") homeWinsTarget = randomInteger(random, 0, 3);
  else homeWinsTarget = randomInteger(random, 0, 7);

  const homeWinningSlots = new Set<number>();
  while (homeWinningSlots.size < homeWinsTarget) homeWinningSlots.add(randomInteger(random, 0, 6));
  for (const [index, game] of games.entries()) {
    const winner = homeWinningSlots.has(index) ? "HOME" : "AWAY";
    await completeGame(db, game.id, simulationScore(random, winner, options.scoreStyle), actorId, simulationRunId);
  }
}

async function simulateVoting(
  db: Prisma.TransactionClient,
  tournamentId: string,
  options: SimulationOptions,
  random: () => number,
  actorId: string,
  simulationRunId: string,
) {
  const players = await db.player.findMany({
    where: { isActive: true, team: { group: { tournamentId } } },
    select: { id: true },
  });
  if (!players.length) throw new Error("No eligible players found.");
  const count = Math.min(Math.max(options.count ?? 30, 1), 500);
  const selected = options.selectedPlayerId && players.some((player) => player.id === options.selectedPlayerId)
    ? options.selectedPlayerId
    : null;

  for (let index = 0; index < count; index += 1) {
    const plain = generateVotingCode();
    const code = await db.votingCode.create({
      data: {
        tournamentId,
        codeHash: hashVotingCode(plain),
        codeHint: votingCodeHint(plain),
        status: "USED",
        issuedAt: new Date(),
        usedAt: new Date(),
      },
    });
    const selectedWeight = Math.min(Math.max(options.selectedWeight ?? 0.65, 0), 1);
    const playerId = selected && random() < selectedWeight ? selected : pickOne<{ id: string }>(random, players).id;
    await db.fanVote.create({ data: { tournamentId, votingCodeId: code.id, playerId } });
  }
  await writeAudit(db, {
    tournamentId,
    actorId,
    action: "FAN_FAVORITE_SIMULATED",
    entityType: "Tournament",
    entityId: tournamentId,
    afterState: { votesCreated: count, selectedPlayerId: selected },
    simulation: true,
    simulationRunId,
  });
  return count;
}

export async function executeSimulation(
  db: Prisma.TransactionClient,
  tournamentId: string,
  actorId: string,
  simulationRunId: string,
  options: SimulationOptions,
) {
  const random = createSeededRandom(options.seed);
  const result: Record<string, unknown> = { kind: options.kind, seed: options.seed };

  if (options.kind === "GAME") {
    if (!options.targetId) throw new Error("Select a game.");
    const game = await db.game.findUniqueOrThrow({ where: { id: options.targetId } });
    const winner = options.winner === "RANDOM" || !options.winner
      ? (random() < 0.5 ? "HOME" : "AWAY")
      : options.winner;
    await completeGame(db, game.id, simulationScore(random, winner, options.scoreStyle), actorId, simulationRunId);
    result.gameId = game.id;
  } else if (options.kind === "MATCHUP") {
    if (!options.targetId) throw new Error("Select a team matchup.");
    await simulateOneMatchup(db, options.targetId, options, random, actorId, simulationRunId);
    result.matchupId = options.targetId;
  } else if (["GROUP_STAGE", "SEMIFINAL", "FINAL", "ENTIRE_TOURNAMENT"].includes(options.kind)) {
    const stages = options.kind === "ENTIRE_TOURNAMENT"
      ? (["GROUP", "SEMIFINAL", "FINAL"] as const)
      : options.kind === "GROUP_STAGE"
        ? (["GROUP"] as const)
        : options.kind === "SEMIFINAL"
          ? (["SEMIFINAL"] as const)
          : (["FINAL"] as const);
    let simulated = 0;
    for (const stage of stages) {
      if (stage !== "GROUP") await recalculateTournament(db, tournamentId, { actorId, simulationRunId });
      const matchups = await db.matchup.findMany({
        where: { tournamentId, stage, homeTeamId: { not: null }, awayTeamId: { not: null } },
        orderBy: { order: "asc" },
      });
      for (const matchup of matchups) {
        if (matchup.status === "COMPLETED") continue;
        await simulateOneMatchup(db, matchup.id, options, random, actorId, simulationRunId);
        await recalculateTournament(db, tournamentId, { actorId, simulationRunId });
        simulated += 1;
      }
    }
    result.matchupsSimulated = simulated;
  } else if (options.kind === "FAN_VOTING") {
    result.votesCreated = await simulateVoting(db, tournamentId, options, random, actorId, simulationRunId);
  } else if (options.kind === "RESET_VOTING") {
    await db.fanVote.deleteMany({ where: { tournamentId } });
    await db.votingCode.deleteMany({ where: { tournamentId } });
    result.votingReset = true;
  } else if (options.kind === "QUICK_SCENARIO") {
    const scenario = options.targetId || "MID_GROUP_STAGE";
    if (scenario === "FRESH_TOURNAMENT" || scenario === "LINEUPS_PENDING") {
      await resetScenarioState(db, tournamentId);
      result.scenario = scenario;
    } else if (scenario === "THREE_WAY_STANDINGS_TIE") {
      await simulateGroupPattern(db, tournamentId, "THREE_WAY_TIE", options, random, actorId, simulationRunId);
      result.scenario = scenario;
    } else if (["WILDCARD_TIEBREAK", "SEMIFINALS_READY", "FINAL_READY", "TOURNAMENT_COMPLETED"].includes(scenario)) {
      await simulateGroupPattern(db, tournamentId, "WILDCARD", options, random, actorId, simulationRunId);
      if (["FINAL_READY", "TOURNAMENT_COMPLETED"].includes(scenario)) {
        const semifinals = await db.matchup.findMany({ where: { tournamentId, stage: "SEMIFINAL" }, orderBy: { order: "asc" } });
        for (const matchup of semifinals) {
          if (matchup.homeTeamId && matchup.awayTeamId) {
            await simulateOneMatchup(db, matchup.id, { ...options, matchupOutcome: "CLOSE_HOME", scoreStyle: "CLOSE" }, random, actorId, simulationRunId);
            await recalculateTournament(db, tournamentId, { actorId, simulationRunId, reason: scenario });
          }
        }
      }
      if (scenario === "TOURNAMENT_COMPLETED") {
        const final = await db.matchup.findFirst({ where: { tournamentId, stage: "FINAL" } });
        if (final?.homeTeamId && final.awayTeamId) {
          await simulateOneMatchup(db, final.id, { ...options, matchupOutcome: "CLOSE_HOME", scoreStyle: "DEUCE" }, random, actorId, simulationRunId);
        }
      }
      result.scenario = scenario;
    } else if (["MID_GROUP_STAGE", "GROUP_ALMOST_COMPLETE"].includes(scenario)) {
      await resetScenarioState(db, tournamentId);
      const groupMatchups = await db.matchup.findMany({ where: { tournamentId, stage: "GROUP" }, orderBy: { order: "asc" } });
      const count = scenario === "MID_GROUP_STAGE" ? Math.ceil(groupMatchups.length / 2) : groupMatchups.length - 1;
      for (const matchup of groupMatchups.slice(0, count)) {
        await simulateOneMatchup(db, matchup.id, options, random, actorId, simulationRunId);
      }
      result.scenario = scenario;
      result.matchupsSimulated = count;
    } else if (["PLAYER_NO_SHOW", "TEAM_FORFEIT", "INTERRUPTED_LIVE_GAME", "SCORE_CORRECTION"].includes(scenario)) {
      await resetScenarioState(db, tournamentId);
      const matchup = await db.matchup.findFirstOrThrow({ where: { tournamentId, stage: "GROUP" }, orderBy: { order: "asc" } });
      const games = await ensureGames(db, matchup.id);
      const firstGame = games[0]!;
      if (scenario === "PLAYER_NO_SHOW") {
        await recordGameState(db, firstGame.id, { homeScore: 0, awayScore: 11, status: "FORFEITED", winnerTeamId: firstGame.awayTeamId, startedAt: new Date(), completedAt: new Date() }, actorId, simulationRunId, "PLAYER_NO_SHOW", "Home pair did not appear");
      } else if (scenario === "TEAM_FORFEIT") {
        for (const game of games) await recordGameState(db, game.id, { homeScore: 0, awayScore: 11, status: "FORFEITED", winnerTeamId: game.awayTeamId, startedAt: new Date(), completedAt: new Date() }, actorId, simulationRunId, "TEAM_FORFEIT", "Home team forfeited the team matchup");
      } else if (scenario === "INTERRUPTED_LIVE_GAME") {
        await recordGameState(db, firstGame.id, { homeScore: 7, awayScore: 5, status: "INTERRUPTED", winnerTeamId: null, startedAt: new Date(), completedAt: null }, actorId, simulationRunId, "INTERRUPT_GAME", "Weather or venue interruption");
      } else {
        await completeGame(db, firstGame.id, { homeScore: 11, awayScore: 9 }, actorId, simulationRunId);
        await completeGame(db, firstGame.id, { homeScore: 9, awayScore: 11 }, actorId, simulationRunId);
      }
      result.scenario = scenario;
    } else if (["FAN_CLOSE_RACE", "FAN_TIED_RANKINGS"].includes(scenario)) {
      await db.fanVote.deleteMany({ where: { tournamentId } });
      await db.votingCode.deleteMany({ where: { tournamentId } });
      await db.voteAttempt.deleteMany({ where: { tournamentId } });
      await db.tournament.update({ where: { id: tournamentId }, data: { votingOpen: true } });
      const eligible = await db.player.findMany({ where: { isActive: true, team: { group: { tournamentId } } }, take: 3, select: { id: true } });
      const base = Math.max(5, options.count ?? 10);
      for (const [index, player] of eligible.entries()) {
        const count = scenario === "FAN_TIED_RANKINGS" ? base : Math.max(1, base - index);
        await simulateVoting(db, tournamentId, { ...options, count, selectedPlayerId: player.id, selectedWeight: 1 }, random, actorId, simulationRunId);
      }
      result.scenario = scenario;
    } else if (scenario === "INVALID_VOTING_ATTEMPTS") {
      for (let index = 0; index < Math.min(options.count ?? 25, 200); index += 1) {
        await db.voteAttempt.create({
          data: { tournamentId, ipHash: `simulation-${index % 5}`, success: false, reason: "INVALID_CODE", codeHint: "SIM…BAD" },
        });
      }
      result.scenario = scenario;
    } else if (scenario === "REUSED_VOTING_CODES" || scenario === "REVOKED_VOTING_CODES") {
      await simulateVotingAttemptScenario(db, tournamentId, scenario === "REUSED_VOTING_CODES" ? "REUSED" : "REVOKED", Math.min(options.count ?? 10, 100));
      result.scenario = scenario;
    } else {
      throw new Error(`Unsupported quick scenario: ${scenario}`);
    }
  } else {
    throw new Error(`Unsupported simulation kind: ${options.kind}`);
  }

  await recalculateTournament(db, tournamentId, { actorId, simulationRunId, reason: options.kind });
  await writeAudit(db, {
    tournamentId,
    actorId,
    action: "SIMULATION_EXECUTED",
    entityType: "SimulationRun",
    entityId: simulationRunId,
    afterState: result as Prisma.InputJsonValue,
    simulation: true,
    simulationRunId,
  });
  return result;
}
