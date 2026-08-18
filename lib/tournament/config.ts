export const MVP_MIN_MATCHES = 3;

export const MVP_COMPONENT_WEIGHTS = {
  wins: 0.15,
  winRate: 0.20,
  participation: 0.10,
  playoffImpact: 0.20,
  strengthOfSchedule: 0.15,
  pointDifferential: 0.15,
  teamFinish: 0.05,
} as const;

// Playoff impact rewards being selected for higher-leverage rounds and then delivering.
// Group / round-robin matches still matter through wins, win rate, participation, SOS and PD.
export const MVP_PLAYOFF_LEVERAGE = {
  GROUP: { played: 0, win: 0 },
  ROUND_ROBIN: { played: 0, win: 0 },
  QUARTERFINAL: { played: 1, win: 1 },
  SEMIFINAL: { played: 2, win: 2 },
  THIRD_PLACE: { played: 2, win: 2 },
  FINAL: { played: 3, win: 3 },
  CUSTOM: { played: 0, win: 0 },
} as const;

// A legal playoff match can reach 15 under the tournament's win-by-2 / cap-15 rule.
// Average point differential is mapped around zero: -15 => 0, 0 => 50, +15 => 100.
export const MVP_POINT_DIFF_CAP = 15;

export const VOTING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const VOTING_CODE_LENGTH = 10;
export const PUBLIC_POLL_INTERVAL_MS = 4000;
export const FAN_FAVORITE_POLL_INTERVAL_MS = 5000;
export const FAN_FAVORITE_VOTE_COOLDOWN_SECONDS = 30;
export const FAN_FAVORITE_CLOSED_POLL_INTERVAL_MS = 12000;
export const FAN_FAVORITE_CODE_POLL_INTERVAL_MS = 2500;
export const PUBLIC_POLL_JITTER_RATIO = 0.18;
