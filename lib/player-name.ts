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

export function formatPlayerCompactName(player: PlayerNameParts) {
  const display = player.displayName?.trim();
  if (display) {
    const parts = display.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]!.slice(0, 1).toUpperCase()}. ${parts.at(-1)}`;
  }
  const first = player.firstName.trim();
  const last = player.lastName.trim();
  if (!first) return last;
  if (!last) return first;
  return `${first.slice(0, 1).toUpperCase()}. ${last}`;
}
