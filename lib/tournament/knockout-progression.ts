/**
 * Source matchup indexes feeding each matchup in the following round.
 * The supported 8-entry bracket uses the official crossed QF feed:
 * SF1 = QF1/QF3 and SF2 = QF2/QF4.
 */
export type QuarterfinalFeedPattern = "STANDARD" | "CROSSED";

export function downstreamSourceIndexes(sourceCount: number, targetCount: number, pattern: QuarterfinalFeedPattern = "CROSSED") {
  if (sourceCount === 4 && targetCount === 2 && pattern === "CROSSED") return [[0, 2], [1, 3]];
  if (sourceCount === targetCount * 2) {
    return Array.from({ length: targetCount }, (_, index) => [index * 2, index * 2 + 1]);
  }
  if (sourceCount === targetCount) return Array.from({ length: targetCount }, (_, index) => [index]);
  return Array.from({ length: targetCount }, () => [] as number[]);
}

export function sourceDisplayOrder(sourceCount: number, targetCount: number, pattern: QuarterfinalFeedPattern = "CROSSED") {
  const mapped = downstreamSourceIndexes(sourceCount, targetCount, pattern).flat();
  return mapped.length === sourceCount && new Set(mapped).size === sourceCount
    ? mapped
    : Array.from({ length: sourceCount }, (_, index) => index);
}
