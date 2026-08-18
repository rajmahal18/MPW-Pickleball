const DEFAULT_TOURNAMENT_START_AT = "2026-08-20T00:00:00+08:00";

/**
 * Official tournament start used by the homepage Live Matches fallback countdown.
 * TOURNAMENT_PUBLIC_LAUNCH_AT remains supported so production does not require an
 * immediate env rename; it no longer gates access to the public site.
 */
export function tournamentStartAtIso() {
  const configured = process.env.TOURNAMENT_START_AT?.trim() || process.env.TOURNAMENT_PUBLIC_LAUNCH_AT?.trim();
  if (!configured) return DEFAULT_TOURNAMENT_START_AT;
  const timestamp = Date.parse(configured);
  return Number.isFinite(timestamp) ? configured : DEFAULT_TOURNAMENT_START_AT;
}

export function tournamentStartAtMs() {
  return Date.parse(tournamentStartAtIso());
}

export function hasTournamentStarted(nowMs = Date.now()) {
  return nowMs >= tournamentStartAtMs();
}

// Legacy aliases retained for compatibility with out-of-tree scripts/imports.
export const publicLaunchAtIso = tournamentStartAtIso;
export const publicLaunchAtMs = tournamentStartAtMs;
export const isPublicLaunchOpen = hasTournamentStarted;
