export const MVP_WEIGHTS = {
  winRate: 40,
  pointDifferential: 25,
  strengthOfSchedule: 20,
  qualityWins: 10,
  consistency: 5,
  minimumGamesForFullConfidence: 4,
  maximumExpectedPointMargin: 11,
} as const;

export const VOTING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const VOTING_CODE_LENGTH = 10;
export const PUBLIC_POLL_INTERVAL_MS = 4000;
export const FAN_FAVORITE_POLL_INTERVAL_MS = 5000;
export const FAN_FAVORITE_CLOSED_POLL_INTERVAL_MS = 12000;
export const PUBLIC_POLL_JITTER_RATIO = 0.18;
