import { MVP_WEIGHTS } from "@/lib/tournament/config";

type MvpPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  sex: "MALE" | "FEMALE";
  team: { id: string; name: string; shortName: string };
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
  homePair: MvpPair;
  awayPair: MvpPair;
};

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
  strengthOfSchedule: number;
  qualityWins: number;
  consistency: number;
  confidence: number;
  components: {
    winRate: number;
    pointDifferential: number;
    strengthOfSchedule: number;
    qualityWins: number;
    consistency: number;
  };
  mvpIndex: number;
};

type MutablePlayerStats = {
  player: MvpPlayer;
  pairIds: Set<string>;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointDifferential: number;
  margins: number[];
  opponents: string[];
  winsAgainst: string[];
  partnerIds: Set<string>;
};

function round(value: number, decimals = 1) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateMvpRankings(games: MvpGame[]) {
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
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointDifferential: 0,
      margins: [],
      opponents: [],
      winsAgainst: [],
      partnerIds: new Set(),
    };
    stats.set(player.id, created);
    return created;
  };

  for (const game of completed) {
    const homePlayers = [game.homePair.playerA, game.homePair.playerB];
    const awayPlayers = [game.awayPair.playerA, game.awayPair.playerB];
    const homeWon = game.winnerTeamId === game.homeTeamId;
    const homeMargin = game.homeScore - game.awayScore;

    for (const [players, opponents, pairId, margin, won] of [
      [homePlayers, awayPlayers, game.homePair.id, homeMargin, homeWon],
      [awayPlayers, homePlayers, game.awayPair.id, -homeMargin, !homeWon],
    ] as const) {
      for (const player of players) {
        const row = ensure(player);
        row.pairIds.add(pairId);
        row.gamesPlayed += 1;
        row.wins += won ? 1 : 0;
        row.losses += won ? 0 : 1;
        row.pointDifferential += margin;
        row.margins.push(margin);
        row.partnerIds.add(players.find((candidate) => candidate.id !== player.id)!.id);
        for (const opponent of opponents) row.opponents.push(opponent.id);
        if (won) for (const opponent of opponents) row.winsAgainst.push(opponent.id);
      }
    }
  }

  const rawWinRate = new Map(
    [...stats.entries()].map(([playerId, row]) => [playerId, row.gamesPlayed ? row.wins / row.gamesPlayed : 0]),
  );

  const rows = [...stats.values()].map<Omit<MvpRow, "rank">>((row) => {
    const winPercentage = row.gamesPlayed ? row.wins / row.gamesPlayed : 0;
    const averagePointDifferential = row.gamesPlayed ? row.pointDifferential / row.gamesPlayed : 0;
    const strengthOfSchedule = row.opponents.length
      ? row.opponents.reduce((sum, opponentId) => sum + (rawWinRate.get(opponentId) ?? 0.5), 0) / row.opponents.length
      : 0;
    const qualityWins = row.winsAgainst.filter((opponentId) => (rawWinRate.get(opponentId) ?? 0) >= 0.6).length / 2;
    const averageMargin = row.margins.length
      ? row.margins.reduce((sum, margin) => sum + margin, 0) / row.margins.length
      : 0;
    const marginVariance = row.margins.length
      ? row.margins.reduce((sum, margin) => sum + (margin - averageMargin) ** 2, 0) / row.margins.length
      : 0;
    const consistency = 1 - clamp(Math.sqrt(marginVariance) / MVP_WEIGHTS.maximumExpectedPointMargin, 0, 1);
    const confidence = clamp(row.gamesPlayed / MVP_WEIGHTS.minimumGamesForFullConfidence, 0, 1);

    const components = {
      winRate: winPercentage * MVP_WEIGHTS.winRate,
      pointDifferential:
        ((clamp(averagePointDifferential, -MVP_WEIGHTS.maximumExpectedPointMargin, MVP_WEIGHTS.maximumExpectedPointMargin) +
          MVP_WEIGHTS.maximumExpectedPointMargin) /
          (MVP_WEIGHTS.maximumExpectedPointMargin * 2)) *
        MVP_WEIGHTS.pointDifferential,
      strengthOfSchedule: strengthOfSchedule * MVP_WEIGHTS.strengthOfSchedule,
      qualityWins: clamp(qualityWins / Math.max(1, row.gamesPlayed), 0, 1) * MVP_WEIGHTS.qualityWins,
      consistency: consistency * MVP_WEIGHTS.consistency,
    };
    const rawIndex = Object.values(components).reduce((sum, component) => sum + component, 0);
    const confidenceMultiplier = 0.65 + confidence * 0.35;

    return {
      player: row.player,
      pairIds: [...row.pairIds],
      lockedPairDerived: row.partnerIds.size <= 1,
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      losses: row.losses,
      winPercentage: round(winPercentage * 100),
      pointDifferential: row.pointDifferential,
      averagePointDifferential: round(averagePointDifferential, 2),
      strengthOfSchedule: round(strengthOfSchedule * 100),
      qualityWins: Math.round(qualityWins),
      consistency: round(consistency * 100),
      confidence: round(confidence * 100),
      components: {
        winRate: round(components.winRate),
        pointDifferential: round(components.pointDifferential),
        strengthOfSchedule: round(components.strengthOfSchedule),
        qualityWins: round(components.qualityWins),
        consistency: round(components.consistency),
      },
      mvpIndex: round(rawIndex * confidenceMultiplier, 2),
    };
  });

  const rankCategory = (sex: "MALE" | "FEMALE") =>
    rows
      .filter((row) => row.player.sex === sex)
      .sort(
        (a, b) =>
          b.mvpIndex - a.mvpIndex ||
          b.gamesPlayed - a.gamesPlayed ||
          b.pointDifferential - a.pointDifferential ||
          `${a.player.firstName} ${a.player.lastName}`.localeCompare(`${b.player.firstName} ${b.player.lastName}`),
      )
      .map<MvpRow>((row, index) => ({ ...row, rank: index + 1 }));

  return { male: rankCategory("MALE"), female: rankCategory("FEMALE"), weights: MVP_WEIGHTS };
}
