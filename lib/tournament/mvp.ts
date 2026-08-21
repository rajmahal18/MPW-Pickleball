import type { MatchupStage } from "@prisma/client";
import { MVP_COMPONENT_WEIGHTS, MVP_MIN_MATCHES, MVP_PLAYOFF_LEVERAGE, MVP_POINT_DIFF_CAP } from "@/lib/tournament/config";
import { formatPlayerFullName } from "@/lib/player-name";

type MvpPlayer = {
  id: string;
  firstName: string;
  middleInitial?: string | null;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  sex: "MALE" | "FEMALE";
  team: { id: string; name: string; shortName: string; logoUrl?: string | null; brandingPrimary?: string | null; brandingSecondary?: string | null; brandingAccent?: string | null; brandingText?: string | null; brandingSurface?: string | null } | null;
};

type MvpPair = { id: string; playerA: MvpPlayer; playerB: MvpPlayer };

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

type StageBreakdown = Record<MatchupStage, { played: number; wins: number; leverage: number }>;

export type MvpComponents = {
  wins: number;
  winRate: number;
  participation: number;
  playoffImpact: number;
  strengthOfSchedule: number;
  pointDifferential: number;
  teamFinish: number;
};

export type MvpRow = {
  rank: number;
  player: MvpPlayer;
  pairIds: string[];
  lockedPairDerived: boolean;
  lockedPartnerId: string | null;
  competitorTeamIds: string[];
  gamesPlayed: number;
  wins: number;
  losses: number;
  winPercentage: number;
  pointDifferential: number;
  averagePointDifferential: number;
  playoffAppearances: number;
  playoffWins: number;
  highestStageWin: MatchupStage | null;
  playoffLeverage: number;
  strengthOfSchedule: number;
  strengthOfScheduleWins: number;
  strengthOfScheduleLosses: number;
  teamFinishLabel: string;
  eligible: boolean;
  matchesToEligibility: number;
  provisional: boolean;
  stageBreakdown: StageBreakdown;
  components: MvpComponents;
  mvpIndex: number;
};

type MutablePlayerStats = {
  player: MvpPlayer;
  pairIds: Set<string>;
  partnerIds: Set<string>;
  competitorTeamIds: Set<string>;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointDifferential: number;
  playoffLeverage: number;
  stageBreakdown: StageBreakdown;
  opponentResults: Map<string, { winsAgainstCandidate: number; lossesAgainstCandidate: number }>;
};

const STAGES: MatchupStage[] = ["GROUP", "ROUND_ROBIN", "ROUND_OF_16", "QUARTERFINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL", "CUSTOM"];
const PLAYOFF_STAGES = new Set<MatchupStage>(["ROUND_OF_16", "QUARTERFINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL"]);
const WIN_TIEBREAK_ORDER: MatchupStage[] = ["FINAL", "THIRD_PLACE", "SEMIFINAL", "QUARTERFINAL", "ROUND_OF_16", "ROUND_ROBIN", "GROUP", "CUSTOM"];

function blankBreakdown(): StageBreakdown {
  return Object.fromEntries(STAGES.map((stage) => [stage, { played: 0, wins: 0, leverage: 0 }])) as StageBreakdown;
}

function round(value: number, decimals = 1) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function playoffLeverage(stage: MatchupStage, won: boolean) {
  const rule = MVP_PLAYOFF_LEVERAGE[stage as keyof typeof MVP_PLAYOFF_LEVERAGE] ?? MVP_PLAYOFF_LEVERAGE.CUSTOM;
  return rule.played + (won ? rule.win : 0);
}

function teamFinish(teamIds: Set<string>, matchups: MvpMatchup[]) {
  let score = 0;
  let label = "Group / early stage";
  const consider = (candidateScore: number, candidateLabel: string) => {
    if (candidateScore > score) { score = candidateScore; label = candidateLabel; }
  };
  for (const matchup of matchups) {
    const involved = (matchup.homeTeamId && teamIds.has(matchup.homeTeamId)) || (matchup.awayTeamId && teamIds.has(matchup.awayTeamId));
    if (!involved) continue;
    if (matchup.stage === "ROUND_OF_16") consider(20, "Round-of-16 qualifier");
    if (matchup.stage === "QUARTERFINAL") consider(35, "Quarterfinalist");
    if (matchup.stage === "SEMIFINAL") consider(55, "Semifinalist");
    if (matchup.stage === "THIRD_PLACE") consider(matchup.winnerTeamId && teamIds.has(matchup.winnerTeamId) ? 65 : 55, matchup.winnerTeamId && teamIds.has(matchup.winnerTeamId) ? "3rd place" : "3rd-place playoff");
    if (matchup.stage === "FINAL") {
      const champion = (matchup.status === "COMPLETED" || matchup.status === "FORFEITED") && matchup.winnerTeamId && teamIds.has(matchup.winnerTeamId);
      consider(champion ? 100 : 75, champion ? "Champion" : "Finalist");
    }
  }
  return { score, label };
}

export function calculateMvpRankings(games: MvpGame[], matchups: MvpMatchup[] = []) {
  const completed = games.filter((game) => (game.status === "COMPLETED" || game.status === "FORFEITED") && game.winnerTeamId);
  const stats = new Map<string, MutablePlayerStats>();

  const ensure = (player: MvpPlayer) => {
    const existing = stats.get(player.id);
    if (existing) return existing;
    const created: MutablePlayerStats = {
      player,
      pairIds: new Set(),
      partnerIds: new Set(),
      competitorTeamIds: new Set(),
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointDifferential: 0,
      playoffLeverage: 0,
      stageBreakdown: blankBreakdown(),
      opponentResults: new Map(),
    };
    stats.set(player.id, created);
    return created;
  };

  for (const game of completed) {
    const sides = [
      { players: [game.homePair.playerA, game.homePair.playerB], opponents: [game.awayPair.playerA, game.awayPair.playerB], pairId: game.homePair.id, teamId: game.homeTeamId, margin: game.homeScore - game.awayScore, won: game.winnerTeamId === game.homeTeamId },
      { players: [game.awayPair.playerA, game.awayPair.playerB], opponents: [game.homePair.playerA, game.homePair.playerB], pairId: game.awayPair.id, teamId: game.awayTeamId, margin: game.awayScore - game.homeScore, won: game.winnerTeamId === game.awayTeamId },
    ];
    for (const side of sides) {
      for (const player of side.players) {
        const row = ensure(player);
        const leverage = playoffLeverage(game.matchup.stage, side.won);
        row.pairIds.add(side.pairId);
        row.competitorTeamIds.add(side.teamId);
        row.gamesPlayed += 1;
        row.wins += side.won ? 1 : 0;
        row.losses += side.won ? 0 : 1;
        row.pointDifferential += side.margin;
        row.playoffLeverage += leverage;
        row.stageBreakdown[game.matchup.stage].played += 1;
        row.stageBreakdown[game.matchup.stage].wins += side.won ? 1 : 0;
        row.stageBreakdown[game.matchup.stage].leverage += leverage;
        const partner = side.players.find((candidate) => candidate.id !== player.id);
        if (partner) row.partnerIds.add(partner.id);
        // Strength of schedule uses every opponent faced, win or loss. Track the
        // head-to-head result separately so that opponent's record can later be
        // evaluated only against the rest of the field.
        for (const opponent of side.opponents) {
          ensure(opponent);
          const headToHead = row.opponentResults.get(opponent.id) ?? { winsAgainstCandidate: 0, lossesAgainstCandidate: 0 };
          if (side.won) headToHead.lossesAgainstCandidate += 1;
          else headToHead.winsAgainstCandidate += 1;
          row.opponentResults.set(opponent.id, headToHead);
        }
      }
    }
  }

  const categoryMaxima = (sex: "MALE" | "FEMALE") => {
    const category = [...stats.values()].filter((row) => row.player.sex === sex);
    return {
      wins: Math.max(1, ...category.map((row) => row.wins)),
      games: Math.max(1, ...category.map((row) => row.gamesPlayed)),
      playoffLeverage: Math.max(1, ...category.map((row) => row.playoffLeverage)),
    };
  };
  const maxima = { MALE: categoryMaxima("MALE"), FEMALE: categoryMaxima("FEMALE") };

  const rows = [...stats.values()].filter((row) => row.gamesPlayed > 0).map<Omit<MvpRow, "rank" | "provisional">>((row) => {
    const winPercentage = (row.wins / row.gamesPlayed) * 100;
    const averagePointDifferential = row.pointDifferential / row.gamesPlayed;
    const playoffAppearances = [...PLAYOFF_STAGES].reduce((sum, stage) => sum + row.stageBreakdown[stage].played, 0);
    const playoffWins = [...PLAYOFF_STAGES].reduce((sum, stage) => sum + row.stageBreakdown[stage].wins, 0);
    const highestStageWin = WIN_TIEBREAK_ORDER.find((stage) => row.stageBreakdown[stage].wins > 0) ?? null;

    // SOS is the pooled record of every opponent faced against everyone else.
    // Remove all head-to-head matches versus this candidate first, then pool
    // the remaining opponent wins/losses. This naturally gives a 4-1 opponent
    // more evidentiary weight than an opponent with only one other result.
    let strengthOfScheduleWins = 0;
    let strengthOfScheduleLosses = 0;
    for (const [opponentId, headToHead] of row.opponentResults) {
      const opponent = stats.get(opponentId);
      if (!opponent) continue;
      strengthOfScheduleWins += Math.max(0, opponent.wins - headToHead.winsAgainstCandidate);
      strengthOfScheduleLosses += Math.max(0, opponent.losses - headToHead.lossesAgainstCandidate);
    }
    const strengthOfScheduleMatches = strengthOfScheduleWins + strengthOfScheduleLosses;
    const strengthOfSchedule = strengthOfScheduleMatches
      ? (strengthOfScheduleWins / strengthOfScheduleMatches) * 100
      : 0;
    const finish = teamFinish(row.competitorTeamIds, matchups);
    const categoryMaximum = maxima[row.player.sex];
    const components: MvpComponents = {
      wins: (row.wins / categoryMaximum.wins) * 100,
      winRate: winPercentage,
      participation: (row.gamesPlayed / categoryMaximum.games) * 100,
      playoffImpact: (row.playoffLeverage / categoryMaximum.playoffLeverage) * 100,
      strengthOfSchedule,
      pointDifferential: clamp(50 + (averagePointDifferential / MVP_POINT_DIFF_CAP) * 50),
      teamFinish: finish.score,
    };
    const mvpIndex = Object.entries(MVP_COMPONENT_WEIGHTS).reduce((sum, [key, weight]) => sum + components[key as keyof MvpComponents] * weight, 0);
    const lockedPartnerId = row.partnerIds.size === 1 ? [...row.partnerIds][0]! : null;
    return {
      player: row.player,
      pairIds: [...row.pairIds],
      lockedPairDerived: Boolean(lockedPartnerId),
      lockedPartnerId,
      competitorTeamIds: [...row.competitorTeamIds],
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      losses: row.losses,
      winPercentage: round(winPercentage),
      pointDifferential: row.pointDifferential,
      averagePointDifferential: round(averagePointDifferential, 2),
      playoffAppearances,
      playoffWins,
      highestStageWin,
      playoffLeverage: round(row.playoffLeverage, 2),
      strengthOfSchedule: round(strengthOfSchedule, 1),
      strengthOfScheduleWins,
      strengthOfScheduleLosses,
      teamFinishLabel: finish.label,
      eligible: row.gamesPlayed >= MVP_MIN_MATCHES,
      matchesToEligibility: Math.max(0, MVP_MIN_MATCHES - row.gamesPlayed),
      stageBreakdown: row.stageBreakdown,
      components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(value, 1)])) as MvpComponents,
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

  const rankCategory = (sex: "MALE" | "FEMALE") => {
    const category = rows.filter((row) => row.player.sex === sex);
    const hasEligibleCandidates = category.some((row) => row.eligible);
    const sorted = category.sort((a, b) =>
      (hasEligibleCandidates ? Number(b.eligible) - Number(a.eligible) : 0) ||
      b.mvpIndex - a.mvpIndex ||
      compareHigherStageWins(a as Omit<MvpRow, "rank">, b as Omit<MvpRow, "rank">) ||
      b.wins - a.wins ||
      b.gamesPlayed - a.gamesPlayed ||
      b.pointDifferential - a.pointDifferential ||
      formatPlayerFullName(a.player).localeCompare(formatPlayerFullName(b.player)),
    );
    let lastIndex: number | null = null;
    let lastRank = 0;
    return sorted.map<MvpRow>((row, index) => {
      if (lastIndex === null || row.mvpIndex !== lastIndex || (hasEligibleCandidates && row.eligible !== sorted[index - 1]?.eligible)) lastRank = index + 1;
      lastIndex = row.mvpIndex;
      return { ...row, provisional: !row.eligible || !hasEligibleCandidates, rank: lastRank };
    });
  };

  const male = rankCategory("MALE");
  const female = rankCategory("FEMALE");
  return { male, female, weights: MVP_COMPONENT_WEIGHTS, minimumMatches: MVP_MIN_MATCHES };
}

export function mvpCandidatePool(rows: MvpRow[]) {
  const hasEligible = rows.some((row) => row.eligible);
  return hasEligible ? rows.filter((row) => row.eligible) : rows;
}

export function organizerSelectionTie(rows: MvpRow[]) {
  const pool = mvpCandidatePool(rows);
  if (pool.length < 2) return [];
  const topIndex = pool[0]?.mvpIndex;
  const tied = pool.filter((row) => row.mvpIndex === topIndex);
  if (tied.length !== 2) return [];
  const [first, second] = tied;
  if (!first || !second) return [];
  const lockedTogether = first.lockedPartnerId === second.player.id && second.lockedPartnerId === first.player.id;
  const identicalRecord = first.gamesPlayed === second.gamesPlayed && first.wins === second.wins && first.losses === second.losses && first.pointDifferential === second.pointDifferential;
  return lockedTogether && identicalRecord ? tied : [];
}
export function resolveMvpAward(rows: MvpRow[], selectedPlayerId: string | null = null) {
  const pool = mvpCandidatePool(rows);
  const tie = organizerSelectionTie(rows);
  if (tie.length === 2) {
    const formallyEligibleTie = tie.every((row) => row.eligible);
    const selected = formallyEligibleTie && selectedPlayerId ? tie.find((row) => row.player.id === selectedPlayerId) ?? null : null;
    return {
      winner: formallyEligibleTie ? selected ?? undefined : undefined,
      tie,
      selectedByOrganizers: Boolean(selected),
      pendingOrganizerSelection: formallyEligibleTie && !selected,
    };
  }
  return { winner: pool[0], tie: [] as MvpRow[], selectedByOrganizers: false, pendingOrganizerSelection: false };
}
