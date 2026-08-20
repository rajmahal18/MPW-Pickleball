export type TeamLineupAccessMatchup = {
  id: string;
  status: string;
  queuePosition: number | null;
  order: number;
  lineupSubmitted?: boolean;
  decidedMatches?: number;
  gamesPerMatchup?: number;
};

export function isTerminalTeamMatchup(status: string) {
  return status === "COMPLETED" || status === "FORFEITED";
}

/**
 * Team-manager lineup access follows the live court queue.
 *
 * - The earliest unfinished queued matchup without a submitted lineup is open.
 * - A submitted earlier matchup blocks the next lineup until a majority of its
 *   configured pair matches are decided.
 * - Unqueued/later matchups stay locked until the facilitator schedules them into the queue.
 *
 * This is deliberately a pure helper so the manager UI and the lineup API enforce
 * exactly the same ordering rule.
 */
export function nextEditableTeamMatchupId(matchups: TeamLineupAccessMatchup[]) {
  const active = matchups.filter((matchup) => !isTerminalTeamMatchup(matchup.status));
  const byQueueThenOrder = (first: TeamLineupAccessMatchup, second: TeamLineupAccessMatchup) =>
    (first.queuePosition ?? Number.MAX_SAFE_INTEGER) - (second.queuePosition ?? Number.MAX_SAFE_INTEGER)
      || first.order - second.order
      || first.id.localeCompare(second.id);

  const inProgress = active
    .filter((matchup) => matchup.status === "LIVE" || matchup.status === "INTERRUPTED")
    .sort(byQueueThenOrder);
  const queued = active
    .filter((matchup) => matchup.queuePosition !== null && !inProgress.some((current) => current.id === matchup.id))
    .sort(byQueueThenOrder);
  const ordered = [...inProgress, ...queued];

  for (const matchup of ordered) {
    if (!matchup.lineupSubmitted) return matchup.id;
    const required = Math.max(1, matchup.gamesPerMatchup ?? 1);
    const majority = Math.floor(required / 2) + 1;
    if ((matchup.decidedMatches ?? 0) < majority) return null;
  }
  return null;
}
