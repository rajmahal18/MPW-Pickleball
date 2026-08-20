import type { MatchupStage } from "@prisma/client";

export type SimulationBracketTrack = "CHAMPIONSHIP" | "WILDCARD";
export type SimulationStageStep = { bracketTrack: SimulationBracketTrack; stage: MatchupStage };

const PRELIMINARY_STAGES: MatchupStage[] = ["GROUP", "ROUND_ROBIN", "CUSTOM"];
const KNOCKOUT_STAGES: MatchupStage[] = ["QUARTERFINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL"];

export function entireDivisionSimulationPlan(wildcardMode: string): SimulationStageStep[] {
  const plan: SimulationStageStep[] = PRELIMINARY_STAGES.map((stage) => ({ bracketTrack: "CHAMPIONSHIP", stage }));
  const tracks: SimulationBracketTrack[] = wildcardMode === "BATTLE" ? ["WILDCARD", "CHAMPIONSHIP"] : ["CHAMPIONSHIP"];
  for (const bracketTrack of tracks) for (const stage of KNOCKOUT_STAGES) plan.push({ bracketTrack, stage });
  return plan;
}
