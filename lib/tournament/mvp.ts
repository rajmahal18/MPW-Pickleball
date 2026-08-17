import type { MatchupStage } from "@prisma/client";
import { MVP_STAGE_POINTS, MVP_TEAM_STAGE_BONUS } from "@/lib/tournament/config";
import { formatPlayerFullName } from "@/lib/player-name";

type MvpPlayer = {
  id: string;
  firstName: string;
  middleInitial?: string | null;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  sex: "MALE" | "FEMALE";
  team: { id: string; name: string; shortName: string } | null;
};

type MvpPair = {
  id: string;
  playerA: MvpPlayer;
  playerB: MvpPlayer;
};

export type MvpGame = {
  id: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  status: string;
  matchup: { stage: MatchupStage };
  homePair: MvpPair;
  awayPair: MvpPair;
};

export type MvpMatchup = {
  stage: MatchupStage;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string | null;
  status: string;
};

type StageBreakdown = Record<MatchupStage, { played: number; wins: number; points: number }>;

export type MvpRow = {
  rank: number;
  player: MvpPlayer;
  pairIds: string[];
  lockedPairDerived: boolean;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winPercentage: number;
  pointDifferential: number;
  averagePointDifferential: number;
  playoffAppearances: number;
  playoffWins: number;
  highestStageWin: MatchupStage | null;
  stagePoints: number;
  teamStageBonus: number;
  championBonus: number;
  stageBreakdown: StageBreakdown;
  mvpIndex: number;
};

type MutablePlayerStats = {
  player: MvpPlayer;
  pairIds: Set<string>;
  partnerIds: Set<string>;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointDifferential: number;
  stagePoints: number;
  stageBreakdown: StageBreakdown;
};

const STAGES: MatchupStage[] = ["GROUP", "ROUND_ROBIN", "QUARTERFINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL", "CUSTOM"];
const PLAYOFF_STAGES = new Set<MatchupStage>(["QUARTERFINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL"]);
const WIN_TIEBREAK_ORDER: MatchupStage[] = ["FINAL", "THIRD_PLACE", "SEMIFINAL", "QUARTERFINAL", "ROUND_ROBIN", "GROUP", "CUSTOM"];

function blankBreakdown(): StageBreakdown {
  return Object.fromEntries(STAGES.map((stage) => [stage, { played: 0, wins: 0, points: 0 }])) as StageBreakdown;
}

function round(value: number, decimals = 1) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function stagePoints(stage: MatchupStage, won: boolean) {
  const rule = MVP_STAGE_POINTS[stage as keyof typeof MVP_STAGE_POINTS] ?? MVP_STAGE_POINTS.CUSTOM;
  return rule.participation + (won ? rule.win : 0);
}

function teamProgressBonus(teamId: string | null | undefined, matchups: MvpMatchup[]) {
  if (!teamId) return { stageBonus: 0, championBonus: 0 };
  const reached = new Set<MatchupStage>();
  let champion = false;
  for (const matchup of matchups) {
    if (matchup.homeTeamId !== teamId && matchup.awayTeamId !== teamId) continue;
    reached.add(matchup.stage);
    if (matchup.stage === "FINAL" && (matchup.status === "COMPLETED" || matchup.status === "FORFEITED") && matchup.winnerTeamId === teamId) champion = true;
  }
  const stageBonus =
    (reached.has("QUARTERFINAL") ? MVP_TEAM_STAGE_BONUS.QUARTERFINAL : 0) +
    (reached.has("SEMIFINAL") ? MVP_TEAM_STAGE_BONUS.SEMIFINAL : 0) +
    (reached.has("THIRD_PLACE") ? MVP_TEAM_STAGE_BONUS.THIRD_PLACE : 0) +
    (reached.has("FINAL") ? MVP_TEAM_STAGE_BONUS.FINAL : 0);
  return { stageBonus, championBonus: champion ? MVP_TEAM_STAGE_BONUS.CHAMPION : 0 };
}

export function calculateMvpRankings(games: MvpGame[], matchups: MvpMatchup[] = []) {
  const completed = games.filter(
    (game) => (game.status === "COMPLETED" || game.status === "FORFEITED") && game.winnerTeamId,
  );
  const stats = new Map<string, MutablePlayerStats>();

  const ensure = (player: MvpPlayer) => {
    const existing = stats.get(player.id);
    if (existing) return existing;
    const created: MutablePlayerStats = {
      player,
      pairIds: new Set(),
      partnerIds: new Set(),
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointDifferential: 0,
      stagePoints: 0,
      stageBreakdown: blankBreakdown(),
    };
    stats.set(player.id, created);
    return created;
  };

  for (const game of completed) {
    const homePlayers = [game.homePair.playerA, game.homePair.playerB];
    const awayPlayers = [game.awayPair.playerA, game.awayPair.playerB];
    const homeWon = game.winnerTeamId === game.homeTeamId;
    const homeMargin = game.homeScore - game.awayScore;
    const stage = game.matchup.stage;

    for (const [players, pairId, margin, won] of [
      [homePlayers, game.homePair.id, homeMargin, homeWon],
      [awayPlayers, game.awayPair.id, -homeMargin, !homeWon],
    ] as const) {
      for (const player of players) {
        const row = ensure(player);
        const earned = stagePoints(stage, won);
        row.pairIds.add(pairId);
        row.gamesPlayed += 1;
        row.wins += won ? 1 : 0;
        row.losses += won ? 0 : 1;
        row.pointDifferential += margin;
        row.stagePoints += earned;
        row.stageBreakdown[stage].played += 1;
        row.stageBreakdown[stage].wins += won ? 1 : 0;
        row.stageBreakdown[stage].points += earned;
        const partner = players.find((candidate) => candidate.id !== player.id);
        if (partner) row.partnerIds.add(partner.id);
      }
    }
  }

  const rows = [...stats.values()].map<Omit<MvpRow, "rank">>((row) => {
    const winPercentage = row.gamesPlayed ? (row.wins / row.gamesPlayed) * 100 : 0;
    const averagePointDifferential = row.gamesPlayed ? row.pointDifferential / row.gamesPlayed : 0;
    const playoffAppearances = [...PLAYOFF_STAGES].reduce((sum, stage) => sum + row.stageBreakdown[stage].played, 0);
    const playoffWins = [...PLAYOFF_STAGES].reduce((sum, stage) => sum + row.stageBreakdown[stage].wins, 0);
    const highestStageWin = WIN_TIEBREAK_ORDER.find((stage) => row.stageBreakdown[stage].wins > 0) ?? null;
    const progress = teamProgressBonus(row.player.team?.id, matchups);
    const mvpIndex = row.stagePoints + progress.stageBonus + progress.championBonus;

    return {
      player: row.player,
      pairIds: [...row.pairIds],
      lockedPairDerived: row.partnerIds.size <= 1,
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      losses: row.losses,
      winPercentage: round(winPercentage),
      pointDifferential: row.pointDifferential,
      averagePointDifferential: round(averagePointDifferential, 2),
      playoffAppearances,
      playoffWins,
      highestStageWin,
      stagePoints: round(row.stagePoints, 2),
      teamStageBonus: round(progress.stageBonus, 2),
      championBonus: round(progress.championBonus, 2),
      stageBreakdown: row.stageBreakdown,
      mvpIndex: round(mvpIndex, 2),
    };
  });

  const compareHigherStageWins = (a: Omit<MvpRow, "rank">, b: Omit<MvpRow, "rank">) => {
    for (const stage of WIN_TIEBREAK_ORDER) {
      const difference = b.stageBreakdown[stage].wins - a.stageBreakdown[stage].wins;
      if (difference) return difference;
    }
    return 0;
  };

  const rankCategory = (sex: "MALE" | "FEMALE") =>
    rows
      .filter((row) => row.player.sex === sex)
      .sort((a, b) =>
        b.mvpIndex - a.mvpIndex ||
        compareHigherStageWins(a, b) ||
        b.wins - a.wins ||
        b.gamesPlayed - a.gamesPlayed ||
        b.pointDifferential - a.pointDifferential ||
        formatPlayerFullName(a.player).localeCompare(formatPlayerFullName(b.player)),
      )
      .map<MvpRow>((row, index) => ({ ...row, rank: index + 1 }));

  return {
    male: rankCategory("MALE"),
    female: rankCategory("FEMALE"),
    stageWeights: MVP_STAGE_POINTS,
    teamStageBonus: MVP_TEAM_STAGE_BONUS,
  };
}
