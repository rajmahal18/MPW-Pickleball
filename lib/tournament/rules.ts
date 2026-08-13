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

export type MatchScoreRule =
  | { mode: "SUDDEN_DEATH_11"; target: 11; cap: 11; label: string }
  | { mode: "WIN_BY_TWO_CAP_15"; target: 11; cap: 15; label: string }
  | { mode: "WIN_BY_TWO"; target: 11; cap: null; label: string };

export const KNOCKOUT_STAGES: MatchupStage[] = ["QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE"];

export function isKnockoutStage(stage: MatchupStage) {
  return KNOCKOUT_STAGES.includes(stage);
}

export function gamesForStage(division: StageGameRuleSource, stage: MatchupStage) {
  if (isKnockoutStage(stage)) return Math.max(1, division.knockoutGamesPerMatchup ?? division.defaultGamesPerMatchup);
  return Math.max(1, division.defaultGamesPerMatchup);
}

export function winsNeededForMatchup(stage: MatchupStage, gamesPerMatchup: number) {
  if (!isKnockoutStage(stage)) return null;
  return Math.floor(Math.max(1, gamesPerMatchup) / 2) + 1;
}

export function scoreRuleForStage(stage: MatchupStage, legacySuddenDeathAtTen = false): MatchScoreRule {
  if (stage === "GROUP" || stage === "ROUND_ROBIN") {
    return { mode: "SUDDEN_DEATH_11", target: 11, cap: 11, label: "First to 11 · sudden death at 10-10" };
  }
  if (isKnockoutStage(stage)) {
    return { mode: "WIN_BY_TWO_CAP_15", target: 11, cap: 15, label: "First to 11 · win by 2 · cap 15" };
  }
  if (legacySuddenDeathAtTen) {
    return { mode: "SUDDEN_DEATH_11", target: 11, cap: 11, label: "First to 11 · sudden death at 10-10" };
  }
  return { mode: "WIN_BY_TWO", target: 11, cap: null, label: "First to 11 · win by 2" };
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

export function assertValidCompletedScore(homeScore: number, awayScore: number, rule: MatchScoreRule | boolean) {
  const resolvedRule = typeof rule === "boolean"
    ? rule
      ? ({ mode: "SUDDEN_DEATH_11", target: 11, cap: 11, label: "First to 11 · sudden death at 10-10" } satisfies MatchScoreRule)
      : ({ mode: "WIN_BY_TWO", target: 11, cap: null, label: "First to 11 · win by 2" } satisfies MatchScoreRule)
    : rule;
  const winner = Math.max(homeScore, awayScore);
  const loser = Math.min(homeScore, awayScore);
  if (homeScore === awayScore) throw new Error("A completed match cannot be tied.");
  if (winner < resolvedRule.target) throw new Error(`A completed match must reach ${resolvedRule.target} points.`);

  if (resolvedRule.mode === "SUDDEN_DEATH_11") {
    if (winner !== 11 || loser > 10) {
      throw new Error("Group-stage matches end at 11; at 10-10, the next point wins 11-10.");
    }
    return;
  }

  if (resolvedRule.mode === "WIN_BY_TWO_CAP_15") {
    if (winner > 15 || loser > 14) throw new Error("Playoff matches are capped at 15 points.");
    if (loser <= 9) {
      if (winner !== 11) throw new Error("Before 10-10, a playoff match ends when a team reaches 11 with at least a two-point lead.");
      return;
    }
    if (winner < 15 && winner !== loser + 2) {
      throw new Error("After 10-10, playoff matches continue until the first two-point lead, up to the 15-point cap.");
    }
    if (winner === 15 && loser < 13) {
      throw new Error("A playoff match would have ended earlier once a two-point lead was reached.");
    }
    return;
  }

  const validNormalFinish = loser <= 9
    ? winner === 11 && winner - loser >= 2
    : winner === loser + 2;
  if (!validNormalFinish) {
    throw new Error("A normal match ends at 11 with a two-point lead, or after 10-10 at the first two-point lead.");
  }
}
