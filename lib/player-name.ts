export type PlayerNameParts = {
  firstName: string;
  middleInitial?: string | null;
  lastName: string;
  displayName?: string | null;
};

function normalizeMiddleInitial(value?: string | null) {
  const cleaned = value?.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return /^[A-Za-z]$/.test(cleaned) ? `${cleaned.toUpperCase()}.` : cleaned;
}

export function formatPlayerFullName(player: PlayerNameParts) {
  return [player.firstName, normalizeMiddleInitial(player.middleInitial), player.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

export function formatPlayerDisplayName(player: PlayerNameParts) {
  return player.displayName?.trim() || formatPlayerFullName(player);
}
