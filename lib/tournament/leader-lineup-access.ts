export type TeamLineupAccessMatchup = {
  id: string;
  status: string;
  queuePosition: number | null;
  order: number;
};

export function isTerminalTeamMatchup(status: string) {
  return status === "COMPLETED" || status === "FORFEITED";
}

/**
 * Team-manager lineup access follows the live court queue.
 *
 * - A currently LIVE/INTERRUPTED matchup stays the team's active matchup until it ends.
 * - Otherwise, only the team's earliest unfinished queued matchup is editable.
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
  if (inProgress[0]) return inProgress[0].id;

  const queued = active
    .filter((matchup) => matchup.queuePosition !== null)
    .sort(byQueueThenOrder);
  return queued[0]?.id ?? null;
}
