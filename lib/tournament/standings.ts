import type { Game, Matchup, Team } from "@prisma/client";

export type StandingTeam = Team & { group: { name: string; slug: string } | null };
export type StandingOverride = { teamId: string; position: number };
export type RankStatus = "RESOLVED" | "TIED";
export type StandingGame = Pick<Game, "homeScore" | "awayScore" | "status">;
export type StandingMatchup = Matchup & { games?: StandingGame[] };

export type StandingRow = {
  team: StandingTeam;
  played: number;
  won: number;
  lost: number;
  gameWins: number;
  gameLosses: number;
  differential: number;
  /** Scoring point differential from decided pair games (points scored minus points conceded). */
  points: number;
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

/**
 * Group ranking order:
 * 1) completed team-matchup record, 2) head-to-head among equal records,
 * 3) pair-game differential / wins, 4) scoring point differential.
 *
 * `points` is intentionally a tiebreak metric, not a +3 standings award.
 */
export function compareStandingRows(a: StandingRow, b: StandingRow) {
  return (
    b.won - a.won ||
    a.lost - b.lost ||
    b.headToHeadPoints - a.headToHeadPoints ||
    b.differential - a.differential ||
    b.gameWins - a.gameWins ||
    b.points - a.points
  );
}

export function compareCrossGroupRows(a: StandingRow, b: StandingRow) {
  return (
    b.won - a.won ||
    a.lost - b.lost ||
    b.differential - a.differential ||
    b.gameWins - a.gameWins ||
    b.points - a.points
  );
}

function standingTieKey(row: StandingRow) {
  return `${row.won}|${row.lost}|${row.headToHeadPoints}|${row.differential}|${row.gameWins}|${row.points}`;
}

function crossGroupTieKey(row: StandingRow) {
  return `${row.won}|${row.lost}|${row.differential}|${row.gameWins}|${row.points}`;
}

function recordTieKey(row: StandingRow) {
  return `${row.won}|${row.lost}`;
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

  // A finalized pair game immediately contributes to Games/Diff and scoring point differential.
  // P/W/L remain team-matchup results and therefore change only once the full matchup is terminal.
  for (const matchup of assignedMatchups) {
    const home = rowByTeam.get(matchup.homeTeamId!);
    const away = rowByTeam.get(matchup.awayTeamId!);
    if (!home || !away) continue;

    home.gameWins += matchup.homeWins;
    home.gameLosses += matchup.awayWins;
    away.gameWins += matchup.awayWins;
    away.gameLosses += matchup.homeWins;

    for (const game of matchup.games ?? []) {
      if (!isTerminalGameStatus(game.status)) continue;
      const margin = game.homeScore - game.awayScore;
      home.points += margin;
      away.points -= margin;
    }

    if (!isTerminalMatchupStatus(matchup.status)) continue;
    home.played += 1;
    away.played += 1;

    if (matchup.homeWins > matchup.awayWins) {
      home.won += 1;
      away.lost += 1;
    } else if (matchup.awayWins > matchup.homeWins) {
      away.won += 1;
      home.lost += 1;
    }
  }

  for (const row of rows) row.differential = row.gameWins - row.gameLosses;

  // Head-to-head is only considered among teams sharing the same completed team-matchup record.
  // Point differential remains a later tiebreak, never a replacement for series W/L.
  const tiedByRecord = new Map<string, StandingRow[]>();
  for (const row of rows) {
    const key = recordTieKey(row);
    const tied = tiedByRecord.get(key) ?? [];
    tied.push(row);
    tiedByRecord.set(key, tied);
  }

  for (const tiedRows of tiedByRecord.values()) {
    if (tiedRows.length < 2) continue;
    const tiedIds = new Set(tiedRows.map((row) => row.team.id));
    for (const matchup of completed) {
      if (!tiedIds.has(matchup.homeTeamId!) || !tiedIds.has(matchup.awayTeamId!)) continue;
      const winnerId = matchup.homeWins === matchup.awayWins
        ? null
        : matchup.homeWins > matchup.awayWins ? matchup.homeTeamId : matchup.awayTeamId;
      const winner = winnerId ? rowByTeam.get(winnerId) : undefined;
      if (winner) winner.headToHeadPoints += 3;
    }
  }

  const metricSorted = rows.sort((first, second) => compareStandingRows(first, second) || stableTeamOrder(first, second));
  // A standings tie is only actionable after every group matchup is terminal. Before then, equal
  // metrics are provisional and must not show T1/T2 or unlock organizer tiebreak controls.
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
  const wildcardPool = remaining.sort((first, second) => compareCrossGroupRows(first, second) || first.team.name.localeCompare(second.team.name));
  const safeWildcardCount = Math.max(0, wildcardCount);
  const wildcards = wildcardPool.slice(0, safeWildcardCount);
  if (safeWildcardCount > 0 && wildcardPool.length > safeWildcardCount) {
    const cutoff = wildcardPool[safeWildcardCount - 1]!;
    const next = wildcardPool[safeWildcardCount]!;
    if (compareCrossGroupRows(cutoff, next) === 0) {
      const tieKey = crossGroupTieKey(cutoff);
      unresolved.push({
        scope: "WILDCARD",
        rank: safeWildcardCount,
        teamIds: wildcardPool.filter((row) => crossGroupTieKey(row) === tieKey).map((row) => row.team.id),
      });
    }
  }
  const qualifiers = [...direct, ...wildcards].sort(compareCrossGroupRows);
  return { direct, wildcards: unresolved.some((tie) => tie.scope === "WILDCARD") ? [] : wildcards, qualifiers: unresolved.length ? direct : qualifiers, unresolved };
}

// Backward-compatible helper retained for existing tests and any old Codex references.
export function selectQualifiers(groupTables: StandingRow[][]) {
  const { direct, wildcards } = selectDivisionQualifiers(groupTables, 1, 1);
  const groupWinners = groupTables.map((table) => table[0]).filter(Boolean);
  const wildcard = wildcards[0] ?? null;
  const seededWinners = [...groupWinners].sort(compareCrossGroupRows);
  return { groupWinners, wildcard, seededWinners, qualifiers: [...direct, ...wildcards] };
}
