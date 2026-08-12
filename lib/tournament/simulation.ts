import type { MatchupStage, Prisma } from "@prisma/client";
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
  divisionId?: string;
  stage?: "GROUP" | "ROUND_ROBIN" | "QUARTERFINAL" | "SEMIFINAL" | "FINAL" | "THIRD_PLACE" | "CUSTOM";
  autoGeneratePairs?: boolean;
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

type SimulationPair = {
  id: string;
  playerAId: string;
  playerBId: string;
};

async function selectSimulationPairs(
  db: Prisma.TransactionClient,
  teamId: string,
  divisionId: string,
  required: number,
  random: () => number,
  autoGeneratePairs: boolean,
) {
  const activePairs = await db.pair.findMany({
    where: {
      teamId,
      isActive: true,
      playerA: { participationStatus: "CONFIRMED", isActive: true, divisionEntries: { some: { divisionId, status: "CONFIRMED" } } },
      playerB: { participationStatus: "CONFIRMED", isActive: true, divisionEntries: { some: { divisionId, status: "CONFIRMED" } } },
    },
    select: { id: true, playerAId: true, playerBId: true },
    orderBy: { label: "asc" },
  });
  const selected: SimulationPair[] = [];
  const usedPlayerIds = new Set<string>();
  for (const pair of activePairs) {
    if (selected.length >= required) break;
    if (usedPlayerIds.has(pair.playerAId) || usedPlayerIds.has(pair.playerBId)) continue;
    selected.push(pair);
    usedPlayerIds.add(pair.playerAId);
    usedPlayerIds.add(pair.playerBId);
  }
  if (selected.length >= required) return selected;
  if (!autoGeneratePairs) throw new Error(`Both teams need ${required} active pairs.`);

  const players = await db.player.findMany({
    where: {
      teamId,
      isActive: true,
      participationStatus: "CONFIRMED",
      divisionEntries: { some: { divisionId, status: "CONFIRMED" } },
    },
    select: { id: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
  });
  const available = players.filter((player) => !usedPlayerIds.has(player.id));
  if (available.length < (required - selected.length) * 2) {
    throw new Error(`Team needs ${required} pairs, but it does not have enough confirmed active players to generate missing pairs.`);
  }
  const shuffled = [...available].sort(() => random() - 0.5);
  while (selected.length < required) {
    const playerA = shuffled.shift();
    const playerB = shuffled.shift();
    if (!playerA || !playerB) break;
    const sequence = selected.length + 1;
    const created = await db.pair.create({
      data: {
        teamId,
        label: `Simulation ${Date.now()}-${sequence}`,
        playerAId: playerA.id,
        playerBId: playerB.id,
        isActive: true,
      },
      select: { id: true, playerAId: true, playerBId: true },
    });
    selected.push(created);
    usedPlayerIds.add(playerA.id);
    usedPlayerIds.add(playerB.id);
  }
  return selected;
}

async function ensureGames(db: Prisma.TransactionClient, matchupId: string, random: () => number, autoGeneratePairs: boolean) {
  const matchup = await db.matchup.findUnique({
    where: { id: matchupId },
    include: { games: true, lineups: { include: { slots: true } } },
  });
  if (!matchup?.homeTeamId || !matchup.awayTeamId) throw new Error("Team matchup does not have two assigned teams.");
  const required = Math.max(1, matchup.gamesPerMatchup);
  if (matchup.games.length === required) return matchup.games.sort((a, b) => a.gameNumber - b.gameNumber);

  const [homePairs, awayPairs] = await Promise.all([
    selectSimulationPairs(db, matchup.homeTeamId, matchup.divisionId, required, random, autoGeneratePairs),
    selectSimulationPairs(db, matchup.awayTeamId, matchup.divisionId, required, random, autoGeneratePairs),
  ]);
  if (homePairs.length !== required || awayPairs.length !== required) throw new Error(`Both teams need ${required} active pairs.`);

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

async function legacyGroupDivisionId(db: Prisma.TransactionClient, tournamentId: string) {
  const division = await db.division.findFirst({
    where: { tournamentId, groups: { some: {} } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  if (!division) throw new Error("Legacy group-stage quick scenarios require a division with configured groups.");
  return division.id;
}

async function resetScenarioState(db: Prisma.TransactionClient, tournamentId: string, divisionId: string) {
  await db.scoreEvent.deleteMany({ where: { game: { matchup: { tournamentId, divisionId } } } });
  await db.game.deleteMany({ where: { matchup: { tournamentId, divisionId } } });
  await db.lineup.deleteMany({ where: { matchup: { tournamentId, divisionId } } });
  await db.matchup.updateMany({
    where: { tournamentId, divisionId, stage: "GROUP" },
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
  const divisionId = await legacyGroupDivisionId(db, tournamentId);
  await resetScenarioState(db, tournamentId, divisionId);
  const groups = await db.group.findMany({
    where: { tournamentId, divisionId },
    include: { teams: { orderBy: { shortName: "asc" } } },
    orderBy: { name: "asc" },
  });
  const groupMatchups = await db.matchup.findMany({ where: { tournamentId, divisionId, stage: "GROUP" }, orderBy: { order: "asc" } });
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
  const player = await db.player.findFirstOrThrow({ where: { tournamentId, isActive: true, participationStatus: "CONFIRMED", teamId: { not: null } } });
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
    if (kind === "REUSED") await db.fanVote.create({ data: { tournamentId, votingCodeId: code.id, sexCategory: player.sex, playerId: player.id } });
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
  const games = await ensureGames(db, matchupId, random, Boolean(options.autoGeneratePairs));
  const outcome = options.matchupOutcome ?? "RANDOM";
  let homeWinsTarget = 0;
  const totalGames = games.length;
  const majority = Math.floor(totalGames / 2) + 1;
  if (outcome === "SWEEP_HOME") homeWinsTarget = totalGames;
  else if (outcome === "SWEEP_AWAY") homeWinsTarget = 0;
  else if (outcome === "CLOSE_HOME") homeWinsTarget = majority;
  else if (outcome === "CLOSE_AWAY") homeWinsTarget = Math.max(0, totalGames - majority);
  else if (outcome === "HOME") homeWinsTarget = randomInteger(random, majority, totalGames);
  else if (outcome === "AWAY") homeWinsTarget = randomInteger(random, 0, Math.max(0, totalGames - majority));
  else homeWinsTarget = randomInteger(random, 0, totalGames);

  const homeWinningSlots = new Set<number>();
  while (homeWinningSlots.size < homeWinsTarget) homeWinningSlots.add(randomInteger(random, 0, Math.max(0, totalGames - 1)));
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
    where: { tournamentId, isActive: true, participationStatus: "CONFIRMED", teamId: { not: null } },
    select: { id: true, sex: true },
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
    const player = selected && random() < selectedWeight
      ? players.find((entry) => entry.id === selected)!
      : pickOne<{ id: string; sex: "MALE" | "FEMALE" }>(random, players);
    await db.fanVote.create({ data: { tournamentId, votingCodeId: code.id, sexCategory: player.sex, playerId: player.id } });
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
  } else if (["STAGE", "GROUP_STAGE", "SEMIFINAL", "FINAL", "ENTIRE_TOURNAMENT"].includes(options.kind)) {
    const allStages: MatchupStage[] = ["GROUP", "ROUND_ROBIN", "QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE", "CUSTOM"];
    const stages: MatchupStage[] = options.kind === "ENTIRE_TOURNAMENT"
      ? allStages
      : options.kind === "STAGE"
        ? [options.stage || "CUSTOM"]
        : options.kind === "GROUP_STAGE"
          ? ["GROUP"]
          : options.kind === "SEMIFINAL"
            ? ["SEMIFINAL"]
            : ["FINAL"];
    let simulated = 0;
    for (const currentStage of stages) {
      await recalculateTournament(db, tournamentId, { actorId, simulationRunId });
      const matchups = await db.matchup.findMany({
        where: {
          tournamentId,
          ...(options.divisionId ? { divisionId: options.divisionId } : {}),
          stage: currentStage,
          homeTeamId: { not: null },
          awayTeamId: { not: null },
        },
        orderBy: { order: "asc" },
      });
      for (const matchup of matchups) {
        if (matchup.status === "COMPLETED" || matchup.status === "FORFEITED") continue;
        await simulateOneMatchup(db, matchup.id, options, random, actorId, simulationRunId);
        await recalculateTournament(db, tournamentId, { actorId, simulationRunId });
        simulated += 1;
      }
    }
    result.matchupsSimulated = simulated;
    result.divisionId = options.divisionId ?? null;
    result.stage = options.kind === "STAGE" ? options.stage ?? "CUSTOM" : null;
  } else if (options.kind === "FAN_VOTING") {
    result.votesCreated = await simulateVoting(db, tournamentId, options, random, actorId, simulationRunId);
  } else if (options.kind === "RESET_VOTING") {
    await db.fanVote.deleteMany({ where: { tournamentId } });
    await db.votingCode.deleteMany({ where: { tournamentId } });
    result.votingReset = true;
  } else if (options.kind === "QUICK_SCENARIO") {
    const scenario = options.targetId || "MID_GROUP_STAGE";
    if (scenario === "FRESH_TOURNAMENT" || scenario === "LINEUPS_PENDING") {
      const divisionId = await legacyGroupDivisionId(db, tournamentId);
      await resetScenarioState(db, tournamentId, divisionId);
      result.scenario = scenario;
      result.divisionId = divisionId;
    } else if (scenario === "THREE_WAY_STANDINGS_TIE") {
      await simulateGroupPattern(db, tournamentId, "THREE_WAY_TIE", options, random, actorId, simulationRunId);
      result.scenario = scenario;
    } else if (["WILDCARD_TIEBREAK", "SEMIFINALS_READY", "FINAL_READY", "TOURNAMENT_COMPLETED"].includes(scenario)) {
      await simulateGroupPattern(db, tournamentId, "WILDCARD", options, random, actorId, simulationRunId);
      if (["FINAL_READY", "TOURNAMENT_COMPLETED"].includes(scenario)) {
        const divisionId = await legacyGroupDivisionId(db, tournamentId);
        const semifinals = await db.matchup.findMany({ where: { tournamentId, divisionId, stage: "SEMIFINAL" }, orderBy: { order: "asc" } });
        for (const matchup of semifinals) {
          if (matchup.homeTeamId && matchup.awayTeamId) {
            await simulateOneMatchup(db, matchup.id, { ...options, matchupOutcome: "CLOSE_HOME", scoreStyle: "CLOSE" }, random, actorId, simulationRunId);
            await recalculateTournament(db, tournamentId, { actorId, simulationRunId, reason: scenario });
          }
        }
      }
      if (scenario === "TOURNAMENT_COMPLETED") {
        const divisionId = await legacyGroupDivisionId(db, tournamentId);
        const final = await db.matchup.findFirst({ where: { tournamentId, divisionId, stage: "FINAL" } });
        if (final?.homeTeamId && final.awayTeamId) {
          await simulateOneMatchup(db, final.id, { ...options, matchupOutcome: "CLOSE_HOME", scoreStyle: "DEUCE" }, random, actorId, simulationRunId);
        }
      }
      result.scenario = scenario;
    } else if (["MID_GROUP_STAGE", "GROUP_ALMOST_COMPLETE"].includes(scenario)) {
      const divisionId = await legacyGroupDivisionId(db, tournamentId);
      await resetScenarioState(db, tournamentId, divisionId);
      const groupMatchups = await db.matchup.findMany({ where: { tournamentId, divisionId, stage: "GROUP" }, orderBy: { order: "asc" } });
      const count = scenario === "MID_GROUP_STAGE" ? Math.ceil(groupMatchups.length / 2) : groupMatchups.length - 1;
      for (const matchup of groupMatchups.slice(0, count)) {
        await simulateOneMatchup(db, matchup.id, options, random, actorId, simulationRunId);
      }
      result.scenario = scenario;
      result.matchupsSimulated = count;
      result.divisionId = divisionId;
    } else if (["PLAYER_NO_SHOW", "TEAM_FORFEIT", "INTERRUPTED_LIVE_GAME", "SCORE_CORRECTION"].includes(scenario)) {
      const divisionId = await legacyGroupDivisionId(db, tournamentId);
      await resetScenarioState(db, tournamentId, divisionId);
      const matchup = await db.matchup.findFirstOrThrow({ where: { tournamentId, divisionId, stage: "GROUP" }, orderBy: { order: "asc" } });
      const games = await ensureGames(db, matchup.id, random, Boolean(options.autoGeneratePairs));
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
      result.divisionId = divisionId;
    } else if (["FAN_CLOSE_RACE", "FAN_TIED_RANKINGS"].includes(scenario)) {
      await db.fanVote.deleteMany({ where: { tournamentId } });
      await db.votingCode.deleteMany({ where: { tournamentId } });
      await db.voteAttempt.deleteMany({ where: { tournamentId } });
      await db.tournament.update({ where: { id: tournamentId }, data: { votingOpen: true } });
      const eligible = await db.player.findMany({ where: { tournamentId, isActive: true, participationStatus: "CONFIRMED", teamId: { not: null } }, take: 3, select: { id: true } });
      const base = Math.max(5, options.count ?? 10);
      for (const [index, player] of eligible.entries()) {
        const count = scenario === "FAN_TIED_RANKINGS" ? base : Math.max(1, base - index);
        await simulateVoting(db, tournamentId, { ...options, count, selectedPlayerId: player.id, selectedWeight: 1 }, random, actorId, simulationRunId);
      }
      result.scenario = scenario;
    } else if (scenario === "INVALID_VOTING_ATTEMPTS") {
      for (let index = 0; index < Math.min(options.count ?? 25, 200); index += 1) {
        await db.voteAttempt.create({
          data: { tournamentId, ipHash: `simulation-${index % 5}`, success: false, reason: "INVALID_CODE", codeHint: "SIM...BAD" },
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
