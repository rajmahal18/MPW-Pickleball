import type { Matchup, Team } from "@prisma/client";

type TeamWithGroup = Team & { group: { name: string; slug: string } };

export function computeStandings(teams: TeamWithGroup[], matchups: Matchup[]) {
  const rows = teams.map((team) => ({
    team,
    played: 0,
    won: 0,
    lost: 0,
    gameWins: 0,
    gameLosses: 0,
    differential: 0,
    points: 0
  }));
  const map = new Map(rows.map((r) => [r.team.id, r]));
  for (const m of matchups.filter((x) => x.status === "COMPLETED" && x.homeTeamId && x.awayTeamId)) {
    const h = map.get(m.homeTeamId!); const a = map.get(m.awayTeamId!);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gameWins += m.homeWins; h.gameLosses += m.awayWins;
    a.gameWins += m.awayWins; a.gameLosses += m.homeWins;
    if (m.homeWins > m.awayWins) { h.won++; h.points += 3; a.lost++; }
    else { a.won++; a.points += 3; h.lost++; }
  }
  for (const r of rows) r.differential = r.gameWins - r.gameLosses;
  return rows.sort((a,b) => b.points-a.points || b.differential-a.differential || b.gameWins-a.gameWins || a.team.name.localeCompare(b.team.name));
}
