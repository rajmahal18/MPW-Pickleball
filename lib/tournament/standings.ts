import type { Matchup, Team } from "@prisma/client";

export type StandingTeam = Team & { group: { name: string; slug: string } };

export type StandingRow = {
  team: StandingTeam;
  played: number;
  won: number;
  lost: number;
  gameWins: number;
  gameLosses: number;
  differential: number;
  points: number;
  headToHeadPoints: number;
};

export function compareStandingRows(a: StandingRow, b: StandingRow) {
  return (
    b.points - a.points ||
    b.headToHeadPoints - a.headToHeadPoints ||
    b.differential - a.differential ||
    b.gameWins - a.gameWins ||
    a.team.name.localeCompare(b.team.name)
  );
}


export function compareCrossGroupRows(a: StandingRow, b: StandingRow) {
  return (
    b.points - a.points ||
    b.differential - a.differential ||
    b.gameWins - a.gameWins ||
    a.team.name.localeCompare(b.team.name)
  );
}

export function computeStandings(teams: StandingTeam[], matchups: Matchup[]): StandingRow[] {
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
  }));
  const rowByTeam = new Map(rows.map((row) => [row.team.id, row]));
  const completed = matchups.filter(
    (matchup) => matchup.status === "COMPLETED" && matchup.homeTeamId && matchup.awayTeamId,
  );

  for (const matchup of completed) {
    const home = rowByTeam.get(matchup.homeTeamId!);
    const away = rowByTeam.get(matchup.awayTeamId!);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.gameWins += matchup.homeWins;
    home.gameLosses += matchup.awayWins;
    away.gameWins += matchup.awayWins;
    away.gameLosses += matchup.homeWins;

    if (matchup.homeWins > matchup.awayWins) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    }
  }

  for (const row of rows) row.differential = row.gameWins - row.gameLosses;

  const tiedByPoints = new Map<number, StandingRow[]>();
  for (const row of rows) {
    const tied = tiedByPoints.get(row.points) ?? [];
    tied.push(row);
    tiedByPoints.set(row.points, tied);
  }

  for (const tiedRows of tiedByPoints.values()) {
    if (tiedRows.length < 2) continue;
    const tiedIds = new Set(tiedRows.map((row) => row.team.id));
    for (const matchup of completed) {
      if (!tiedIds.has(matchup.homeTeamId!) || !tiedIds.has(matchup.awayTeamId!)) continue;
      const winnerId = matchup.homeWins > matchup.awayWins ? matchup.homeTeamId : matchup.awayTeamId;
      const winner = winnerId ? rowByTeam.get(winnerId) : undefined;
      if (winner) winner.headToHeadPoints += 3;
    }
  }

  return rows.sort(compareStandingRows);
}

export function selectQualifiers(groupTables: StandingRow[][]) {
  const groupWinners = groupTables.map((table) => table[0]).filter(Boolean);
  const runnerUps = groupTables.map((table) => table[1]).filter(Boolean).sort(compareCrossGroupRows);
  const wildcard = runnerUps[0] ?? null;
  const seededWinners = [...groupWinners].sort(compareCrossGroupRows);
  return { groupWinners, wildcard, seededWinners };
}
