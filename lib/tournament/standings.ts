import type { Game, Matchup, Team } from "@prisma/client";

export type StandingTeam = Team & { group: { name: string; slug: string } | null };
export type StandingOverride = { teamId: string; position: number };
export type RankStatus = "RESOLVED" | "TIED";
export type StandingGame = Pick<Game, "homeScore" | "awayScore" | "status">;
export type StandingMatchup = Matchup & { games?: StandingGame[] };

export type StandingRow = {
  team: StandingTeam;
  /** Total decided pair matches played. */
  played: number;
  /** Total pair-match wins. */
  won: number;
  /** Total pair-match losses. */
  lost: number;
  /** Legacy alias for pair-match wins; kept for qualifier/tiebreak compatibility. */
  gameWins: number;
  gameLosses: number;
  /** Legacy pair-win differential kept for compatibility; it is no longer a ranking criterion. */
  differential: number;
  /** Net point differential: total points scored minus total points conceded in decided pair matches. */
  points: number;
  totalPointsScored: number;
  totalPointsConceded: number;
  /** Head-to-head wins among teams still tied after every preceding standings metric. */
  headToHeadPoints: number;
  rank: number;
  rankLabel: string;
  rankStatus: RankStatus;
  tieGroupKey: string | null;
  tiebreakApplied: boolean;
};

export function isTerminalMatchupStatus(status: Matchup["status"] | string) {
  return status === "COMPLETED" || status === "FORFEITED";
}

function isTerminalGameStatus(status: Game["status"] | string) {
  return status === "COMPLETED" || status === "FORFEITED";
}

export function areGroupMatchupsComplete(matchups: Array<Pick<Matchup, "status">>) {
  return matchups.length > 0 && matchups.every((matchup) => isTerminalMatchupStatus(matchup.status));
}

export function shouldRefreshGroupDependencies(stage: string, terminalBefore: boolean, terminalAfter: boolean) {
  return stage === "GROUP" && (terminalBefore || terminalAfter);
}

/**
 * Group ranking order uses the official pair-match tiebreak sequence:
 *    A. total pair-match wins
 *    B. net point differential (points scored - points conceded)
 *    C. total points scored
 *    D. head-to-head result among teams still tied after A/B/C
 *
 * The organizer can still resolve a mathematically exact tie after all four criteria.
 */
export function compareStandingRows(a: StandingRow, b: StandingRow) {
  return (
    b.gameWins - a.gameWins ||
    b.points - a.points ||
    b.totalPointsScored - a.totalPointsScored ||
    b.headToHeadPoints - a.headToHeadPoints
  );
}

/** Cross-group wildcard rows cannot have a meaningful head-to-head result. */
export function compareCrossGroupRows(a: StandingRow, b: StandingRow) {
  return (
    b.gameWins - a.gameWins ||
    b.points - a.points ||
    b.totalPointsScored - a.totalPointsScored
  );
}

function standingTieKey(row: StandingRow) {
  return `${row.gameWins}|${row.points}|${row.headToHeadPoints}|${row.totalPointsScored}`;
}

function crossGroupTieKey(row: StandingRow) {
  return `${row.gameWins}|${row.points}|${row.totalPointsScored}`;
}

function preHeadToHeadTieKey(row: StandingRow) {
  return `${row.gameWins}|${row.points}|${row.totalPointsScored}`;
}

function stableTeamOrder(a: StandingRow, b: StandingRow) {
  const firstPosition = a.team.groupPosition ?? Number.MAX_SAFE_INTEGER;
  const secondPosition = b.team.groupPosition ?? Number.MAX_SAFE_INTEGER;
  return firstPosition - secondPosition
    || a.team.shortName.localeCompare(b.team.shortName)
    || a.team.name.localeCompare(b.team.name)
    || a.team.id.localeCompare(b.team.id);
}

function applyRanks(rows: StandingRow[], overrides: StandingOverride[], allowUnresolvedTies: boolean) {
  if (!allowUnresolvedTies) {
    return rows.map((row, index) => ({
      ...row,
      rank: index + 1,
      rankLabel: String(index + 1),
      rankStatus: "RESOLVED" as const,
      tieGroupKey: null,
      tiebreakApplied: false,
    }));
  }

  const overrideByTeam = new Map(overrides.map((override) => [override.teamId, override.position]));
  const ranked: StandingRow[] = [];
  let index = 0;
  while (index < rows.length) {
    const current = rows[index]!;
    const tiedRows = [current];
    let cursor = index + 1;
    while (cursor < rows.length && compareStandingRows(current, rows[cursor]!) === 0) {
      tiedRows.push(rows[cursor]!);
      cursor += 1;
    }

    const rank = index + 1;
    if (tiedRows.length === 1) {
      ranked.push({ ...current, rank, rankLabel: String(rank), rankStatus: "RESOLVED", tieGroupKey: null, tiebreakApplied: false });
    } else {
      const overridePositions = tiedRows.map((row) => overrideByTeam.get(row.team.id));
      const uniquePositions = new Set(overridePositions);
      const hasCompleteOverride = overridePositions.every((position) => Number.isInteger(position))
        && uniquePositions.size === tiedRows.length;
      const ordered = hasCompleteOverride
        ? [...tiedRows].sort((first, second) => (overrideByTeam.get(first.team.id) ?? 999) - (overrideByTeam.get(second.team.id) ?? 999))
        : tiedRows;
      for (const [tieIndex, row] of ordered.entries()) {
        ranked.push({
          ...row,
          rank: hasCompleteOverride ? rank + tieIndex : rank,
          rankLabel: hasCompleteOverride ? String(rank + tieIndex) : `T${rank}`,
          rankStatus: hasCompleteOverride ? "RESOLVED" : "TIED",
          tieGroupKey: hasCompleteOverride ? null : standingTieKey(row),
          tiebreakApplied: hasCompleteOverride,
        });
      }
    }
    index = cursor;
  }
  return ranked;
}

export function computeStandings(teams: StandingTeam[], matchups: StandingMatchup[], overrides: StandingOverride[] = []): StandingRow[] {
  const rows = teams.map<StandingRow>((team) => ({
    team,
    played: 0,
    won: 0,
    lost: 0,
    gameWins: 0,
    gameLosses: 0,
    differential: 0,
    points: 0,
    totalPointsScored: 0,
    totalPointsConceded: 0,
    headToHeadPoints: 0,
    rank: 0,
    rankLabel: "",
    rankStatus: "RESOLVED",
    tieGroupKey: null,
    tiebreakApplied: false,
  }));
  const rowByTeam = new Map(rows.map((row) => [row.team.id, row]));
  const assignedMatchups = matchups.filter((matchup) => matchup.homeTeamId && matchup.awayTeamId);
  const completed = assignedMatchups.filter((matchup) => isTerminalMatchupStatus(matchup.status));

  // Decided pair matches immediately contribute to Matches/W/L and scoring totals.
  for (const matchup of assignedMatchups) {
    const home = rowByTeam.get(matchup.homeTeamId!);
    const away = rowByTeam.get(matchup.awayTeamId!);
    if (!home || !away) continue;

    home.gameWins += matchup.homeWins;
    home.gameLosses += matchup.awayWins;
    away.gameWins += matchup.awayWins;
    away.gameLosses += matchup.homeWins;

    const decidedCount = matchup.homeWins + matchup.awayWins;
    home.played += decidedCount;
    away.played += decidedCount;
    home.won += matchup.homeWins;
    home.lost += matchup.awayWins;
    away.won += matchup.awayWins;
    away.lost += matchup.homeWins;

    for (const game of matchup.games ?? []) {
      if (!isTerminalGameStatus(game.status)) continue;
      const margin = game.homeScore - game.awayScore;
      home.points += margin;
      away.points -= margin;
      home.totalPointsScored += game.homeScore;
      home.totalPointsConceded += game.awayScore;
      away.totalPointsScored += game.awayScore;
      away.totalPointsConceded += game.homeScore;
    }

  }

  for (const row of rows) row.differential = row.gameWins - row.gameLosses;

  // Head-to-head is the final automatic criterion, so evaluate it only among teams
  // still tied after pair-match wins, net point differential, and total points.
  const tiedBeforeHeadToHead = new Map<string, StandingRow[]>();
  for (const row of rows) {
    const key = preHeadToHeadTieKey(row);
    const tied = tiedBeforeHeadToHead.get(key) ?? [];
    tied.push(row);
    tiedBeforeHeadToHead.set(key, tied);
  }

  for (const tiedRows of tiedBeforeHeadToHead.values()) {
    if (tiedRows.length < 2) continue;
    const tiedIds = new Set(tiedRows.map((row) => row.team.id));
    for (const matchup of completed) {
      if (!tiedIds.has(matchup.homeTeamId!) || !tiedIds.has(matchup.awayTeamId!)) continue;
      const winnerId = matchup.homeWins === matchup.awayWins
        ? null
        : matchup.homeWins > matchup.awayWins ? matchup.homeTeamId : matchup.awayTeamId;
      const winner = winnerId ? rowByTeam.get(winnerId) : undefined;
      if (winner) winner.headToHeadPoints += 1;
    }
  }

  const metricSorted = rows.sort((first, second) => compareStandingRows(first, second) || stableTeamOrder(first, second));
  // T# and organizer tiebreak controls appear only after every group matchup is terminal.
  return applyRanks(metricSorted, overrides, areGroupMatchupsComplete(matchups));
}

export function selectDivisionQualifiers(
  groupTables: StandingRow[][],
  qualifiersPerGroup: number,
  wildcardCount: number,
  options: { groupStageComplete?: boolean } = {},
) {
  if (options.groupStageComplete === false) {
    return {
      direct: [],
      wildcards: [],
      qualifiers: [],
      unresolved: [{ scope: "DIRECT" as const, rank: 0, teamIds: groupTables.flatMap((table) => table.map((row) => row.team.id)) }],
    };
  }

  const direct: StandingRow[] = [];
  const remaining: StandingRow[] = [];
  const unresolved: Array<{ scope: "DIRECT" | "WILDCARD"; rank: number; teamIds: string[] }> = [];
  const safePerGroup = Math.max(0, qualifiersPerGroup);
  for (const rawTable of groupTables) {
    const table = rawTable.map((row, index) => ({
      ...row,
      totalPointsScored: row.totalPointsScored ?? 0,
      totalPointsConceded: row.totalPointsConceded ?? 0,
      rank: Number.isInteger(row.rank) && row.rank > 0 ? row.rank : index + 1,
      rankLabel: row.rankLabel || String(index + 1),
      rankStatus: row.rankStatus || "RESOLVED",
      tieGroupKey: row.tieGroupKey ?? null,
      tiebreakApplied: Boolean(row.tiebreakApplied),
    }));
    const tiedGroups = new Map<string, StandingRow[]>();
    for (const row of table) {
      if (row.rankStatus === "TIED" && row.tieGroupKey) {
        const rows = tiedGroups.get(row.tieGroupKey) ?? [];
        rows.push(row);
        tiedGroups.set(row.tieGroupKey, rows);
      }
    }
    const blockedTieKeys = new Set<string>();
    for (const tiedRows of tiedGroups.values()) {
      const firstRank = tiedRows[0]?.rank ?? 0;
      const lastRank = firstRank + tiedRows.length - 1;
      if (safePerGroup > 0 && firstRank <= safePerGroup && lastRank >= safePerGroup) {
        unresolved.push({ scope: "DIRECT", rank: safePerGroup, teamIds: tiedRows.map((row) => row.team.id) });
        if (tiedRows[0]?.tieGroupKey) blockedTieKeys.add(tiedRows[0].tieGroupKey);
      }
    }
    direct.push(...table.filter((row) => row.rankStatus === "RESOLVED" && row.rank <= safePerGroup));
    remaining.push(...table.filter((row) => row.rank > safePerGroup && (!row.tieGroupKey || !blockedTieKeys.has(row.tieGroupKey))));
  }
  const wildcardPool = remaining.sort((first, second) => first.rank - second.rank || compareCrossGroupRows(first, second) || first.team.name.localeCompare(second.team.name));
  const safeWildcardCount = Math.max(0, wildcardCount);
  const wildcards = wildcardPool.slice(0, safeWildcardCount);
  if (safeWildcardCount > 0 && wildcardPool.length > safeWildcardCount) {
    const cutoff = wildcardPool[safeWildcardCount - 1]!;
    const next = wildcardPool[safeWildcardCount]!;
    if (cutoff.rank === next.rank && compareCrossGroupRows(cutoff, next) === 0) {
      const tieKey = crossGroupTieKey(cutoff);
      unresolved.push({
        scope: "WILDCARD",
        rank: safeWildcardCount,
        teamIds: wildcardPool.filter((row) => row.rank === cutoff.rank && crossGroupTieKey(row) === tieKey).map((row) => row.team.id),
      });
    }
  }
  const qualifiers = [...direct, ...wildcards].sort(compareCrossGroupRows);
  return { direct, wildcards: unresolved.some((tie) => tie.scope === "WILDCARD") ? [] : wildcards, qualifiers: unresolved.length ? direct : qualifiers, unresolved };
}

export type QualificationOutcome = "QUALIFIED" | "CLINCHED" | "ELIMINATED" | "CONTENDING" | "PENDING";

type QualificationMatchup = Pick<StandingMatchup, "homeTeamId" | "awayTeamId" | "homeWins" | "awayWins" | "gamesPerMatchup" | "status">;

export function securedGroupSeedTeamIds(
  table: StandingRow[],
  matchups: QualificationMatchup[],
  maximumSeed: number,
) {
  const remainingWins = new Map<string, number>();
  for (const matchup of matchups) {
    if (!matchup.homeTeamId || !matchup.awayTeamId || isTerminalMatchupStatus(matchup.status)) continue;
    const remaining = Math.max(0, matchup.gamesPerMatchup - matchup.homeWins - matchup.awayWins);
    remainingWins.set(matchup.homeTeamId, (remainingWins.get(matchup.homeTeamId) ?? 0) + remaining);
    remainingWins.set(matchup.awayTeamId, (remainingWins.get(matchup.awayTeamId) ?? 0) + remaining);
  }

  const secured = new Map<number, string>();
  for (const row of table) {
    const rivals = table.filter((other) => other.team.id !== row.team.id);
    const maximumWins = row.gameWins + (remainingWins.get(row.team.id) ?? 0);
    const guaranteedAhead = rivals.filter((other) => other.gameWins > maximumWins).length;
    const possiblyAheadOrTied = rivals.filter((other) => other.gameWins + (remainingWins.get(other.team.id) ?? 0) >= row.gameWins).length;
    const exactRank = guaranteedAhead + 1;
    if (exactRank <= maximumSeed && possiblyAheadOrTied === guaranteedAhead) secured.set(exactRank, row.team.id);
  }
  return secured;
}

/**
 * Conservative early qualification bounds.
 *
 * Pair-match wins are the first standings criterion. A team is therefore safely
 * clinched when too few group rivals can even tie its current win total, and is
 * safely eliminated when enough rivals already exceed its best possible total.
 * Equality remains CONTENDING because NPD, total points, and head-to-head can
 * still decide it. Early wildcard conclusions are deliberately not guessed.
 */
function earlyQualificationOutcomes(
  groupTables: StandingRow[][],
  qualifiersPerGroup: number,
  wildcardCount: number,
  matchups: QualificationMatchup[],
) {
  const outcomes = new Map<string, QualificationOutcome>();
  const remainingWins = new Map<string, number>();
  for (const matchup of matchups) {
    if (!matchup.homeTeamId || !matchup.awayTeamId || isTerminalMatchupStatus(matchup.status)) continue;
    const remaining = Math.max(0, matchup.gamesPerMatchup - matchup.homeWins - matchup.awayWins);
    remainingWins.set(matchup.homeTeamId, (remainingWins.get(matchup.homeTeamId) ?? 0) + remaining);
    remainingWins.set(matchup.awayTeamId, (remainingWins.get(matchup.awayTeamId) ?? 0) + remaining);
  }

  const directSlots = Math.max(0, qualifiersPerGroup);
  for (const table of groupTables) {
    for (const row of table) {
      const rivals = table.filter((other) => other.team.id !== row.team.id);
      const currentWins = row.gameWins;
      const maximumWins = currentWins + (remainingWins.get(row.team.id) ?? 0);
      const rivalsAbleToReachCurrent = rivals.filter((other) => other.gameWins + (remainingWins.get(other.team.id) ?? 0) >= currentWins).length;
      const rivalsAlreadyBeyondMaximum = rivals.filter((other) => other.gameWins > maximumWins).length;
      const directClinched = directSlots > 0 && rivalsAbleToReachCurrent < directSlots;
      const directEliminated = directSlots === 0 || rivalsAlreadyBeyondMaximum >= directSlots;
      outcomes.set(row.team.id, directClinched
        ? "CLINCHED"
        : directEliminated && wildcardCount <= 0
          ? "ELIMINATED"
          : "CONTENDING");
    }
  }
  return outcomes;
}

export function qualificationOutcomes(
  groupTables: StandingRow[][],
  qualifiersPerGroup: number,
  wildcardCount: number,
  options: { groupStageComplete: boolean; groupMatchups?: QualificationMatchup[] },
) {
  const outcomes = new Map<string, QualificationOutcome>();
  if (!options.groupStageComplete) {
    return options.groupMatchups
      ? earlyQualificationOutcomes(groupTables, qualifiersPerGroup, wildcardCount, options.groupMatchups)
      : outcomes;
  }

  const selection = selectDivisionQualifiers(groupTables, qualifiersPerGroup, wildcardCount, { groupStageComplete: true });
  const qualifiedIds = new Set(selection.qualifiers.map((row) => row.team.id));
  const unresolvedIds = new Set(selection.unresolved.flatMap((tie) => tie.teamIds));
  for (const row of groupTables.flat()) {
    outcomes.set(row.team.id, unresolvedIds.has(row.team.id) ? "PENDING" : qualifiedIds.has(row.team.id) ? "QUALIFIED" : "ELIMINATED");
  }
  return outcomes;
}

// Backward-compatible helper retained for existing tests and any old Codex references.
export function selectQualifiers(groupTables: StandingRow[][]) {
  const { direct, wildcards } = selectDivisionQualifiers(groupTables, 1, 1);
  const groupWinners = groupTables.map((table) => table[0]).filter(Boolean);
  const wildcard = wildcards[0] ?? null;
  const seededWinners = [...groupWinners].sort(compareCrossGroupRows);
  return { groupWinners, wildcard, seededWinners, qualifiers: [...direct, ...wildcards] };
}
