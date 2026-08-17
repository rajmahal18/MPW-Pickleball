export const MVP_STAGE_POINTS = {
  GROUP: { participation: 0, win: 1 },
  ROUND_ROBIN: { participation: 0, win: 1 },
  QUARTERFINAL: { participation: 0.5, win: 1.5 },
  SEMIFINAL: { participation: 0.75, win: 2.25 },
  THIRD_PLACE: { participation: 1, win: 2.5 },
  FINAL: { participation: 1.5, win: 3.5 },
  CUSTOM: { participation: 0, win: 1 },
} as const;

export const MVP_TEAM_STAGE_BONUS = {
  QUARTERFINAL: 0.25,
  SEMIFINAL: 0.5,
  THIRD_PLACE: 0.75,
  FINAL: 1.25,
  CHAMPION: 0.5,
} as const;

export const VOTING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const VOTING_CODE_LENGTH = 10;
export const PUBLIC_POLL_INTERVAL_MS = 4000;
export const FAN_FAVORITE_POLL_INTERVAL_MS = 5000;
export const FAN_FAVORITE_CLOSED_POLL_INTERVAL_MS = 12000;
export const FAN_FAVORITE_CODE_POLL_INTERVAL_MS = 2500;
export const PUBLIC_POLL_JITTER_RATIO = 0.18;
