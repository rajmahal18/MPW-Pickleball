import type { MatchupStage, PairMatchCategory } from "@prisma/client";

export type StageGameRuleSource = {
  defaultGamesPerMatchup: number;
  knockoutGamesPerMatchup: number | null;
};

export type StageCategoryRuleSource = StageGameRuleSource & {
  groupMatchCategories: PairMatchCategory[];
  knockoutMatchCategories: PairMatchCategory[];
  groupCategoryRulesEnabled: boolean;
  knockoutCategoryRulesEnabled: boolean;
};

export const KNOCKOUT_STAGES: MatchupStage[] = ["QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE"];

export function isKnockoutStage(stage: MatchupStage) {
  return KNOCKOUT_STAGES.includes(stage);
}

export function gamesForStage(division: StageGameRuleSource, stage: MatchupStage) {
  if (isKnockoutStage(stage)) return Math.max(1, division.knockoutGamesPerMatchup ?? division.defaultGamesPerMatchup);
  return Math.max(1, division.defaultGamesPerMatchup);
}


export function defaultCategoryPattern(count: number, kind: "GROUP" | "KNOCKOUT") {
  const safeCount = Math.max(1, count);
  if (kind === "GROUP" && safeCount === 7) {
    return ["MENS", "WOMENS", "MENS", "WOMENS", "MENS", "WOMENS", "MIXED"] satisfies PairMatchCategory[];
  }
  if (kind === "KNOCKOUT" && safeCount === 5) {
    return ["MENS", "WOMENS", "MIXED", "WOMENS", "MENS"] satisfies PairMatchCategory[];
  }
  return Array.from({ length: safeCount }, (_, index) => index % 2 === 0 ? "MENS" : "WOMENS") satisfies PairMatchCategory[];
}

export function categoriesForStage(division: StageCategoryRuleSource, stage: MatchupStage, count = gamesForStage(division, stage)) {
  const knockout = isKnockoutStage(stage);
  const enabled = knockout ? division.knockoutCategoryRulesEnabled : division.groupCategoryRulesEnabled;
  const configured = knockout ? division.knockoutMatchCategories : division.groupMatchCategories;
  if (!enabled) return Array.from({ length: Math.max(1, count) }, () => null);
  return Array.from({ length: Math.max(1, count) }, (_, index) => configured[index] ?? null);
}

export function categoryLabel(category: PairMatchCategory | null | undefined) {
  if (category === "MENS") return "Men's";
  if (category === "WOMENS") return "Women's";
  if (category === "MIXED") return "Mixed";
  return "Not set";
}

export function assertValidCompletedScore(homeScore: number, awayScore: number, suddenDeathAtTen: boolean) {
  const winner = Math.max(homeScore, awayScore);
  const loser = Math.min(homeScore, awayScore);
  if (homeScore === awayScore) throw new Error("A completed match cannot be tied.");
  if (winner < 11) throw new Error("A completed match must reach 11 points.");

  if (suddenDeathAtTen) {
    if (loser >= 10) {
      if (winner !== 11 || loser !== 10) {
        throw new Error("With sudden death enabled, a match that reaches 10-10 must end on the next point (11-10).");
      }
      return;
    }
    if (winner !== 11 || winner - loser < 2) {
      throw new Error("Before 10-10, the match ends at 11 with at least a two-point lead; at 10-10, the next point wins.");
    }
    return;
  }

  // Normal win-by-two: 11-x is final when x <= 9. Once both sides reach 10,
  // play continues only until the first two-point lead (12-10, 13-11, ...).
  const validNormalFinish = loser <= 9
    ? winner === 11 && winner - loser >= 2
    : winner === loser + 2;
  if (!validNormalFinish) {
    throw new Error("A normal match ends at 11 with a two-point lead, or after 10-10 at the first two-point lead.");
  }
}
