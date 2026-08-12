import type { MatchupStage } from "@prisma/client";

export type StageGameRuleSource = {
  defaultGamesPerMatchup: number;
  knockoutGamesPerMatchup: number | null;
};

export const KNOCKOUT_STAGES: MatchupStage[] = ["QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE"];

export function isKnockoutStage(stage: MatchupStage) {
  return KNOCKOUT_STAGES.includes(stage);
}

export function gamesForStage(division: StageGameRuleSource, stage: MatchupStage) {
  if (isKnockoutStage(stage)) return Math.max(1, division.knockoutGamesPerMatchup ?? division.defaultGamesPerMatchup);
  return Math.max(1, division.defaultGamesPerMatchup);
}

export function assertValidCompletedScore(homeScore: number, awayScore: number, suddenDeathAtTen: boolean) {
  const winner = Math.max(homeScore, awayScore);
  const loser = Math.min(homeScore, awayScore);
  if (homeScore === awayScore) throw new Error("A completed game cannot be tied.");
  if (winner < 11) throw new Error("A completed game must reach 11 points.");

  if (suddenDeathAtTen) {
    if (loser >= 10) {
      if (winner !== 11 || loser !== 10) {
        throw new Error("With sudden death enabled, a game that reaches 10-10 must end on the next point (11-10).");
      }
      return;
    }
    if (winner !== 11 || winner - loser < 2) {
      throw new Error("Before 10-10, the game ends at 11 with at least a two-point lead; at 10-10, the next point wins.");
    }
    return;
  }

  // Normal win-by-two: 11-x is final when x <= 9. Once both sides reach 10,
  // play continues only until the first two-point lead (12-10, 13-11, ...).
  const validNormalFinish = loser <= 9
    ? winner === 11 && winner - loser >= 2
    : winner === loser + 2;
  if (!validNormalFinish) {
    throw new Error("A normal game ends at 11 with a two-point lead, or after 10-10 at the first two-point lead.");
  }
}
