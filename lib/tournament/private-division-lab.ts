import { isRecognitionDivision } from "@/lib/tournament/recognition-division";

const PRODUCTION_LAB_KINDS = new Set(["GAME", "MATCHUP", "STAGE", "ENTIRE_TOURNAMENT", "RESET_DIVISION"]);

export function isProductionPrivateLabKind(kind: string) {
  return PRODUCTION_LAB_KINDS.has(kind);
}

export function isProductionPrivateLabDivision(division: { slug: string; isPublic: boolean }) {
  return !division.isPublic && !isRecognitionDivision(division);
}
