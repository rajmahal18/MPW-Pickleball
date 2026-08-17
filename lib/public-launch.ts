const DEFAULT_PUBLIC_LAUNCH_AT = "2026-08-20T00:00:00+08:00";

export function publicLaunchAtIso() {
  const configured = process.env.TOURNAMENT_PUBLIC_LAUNCH_AT?.trim();
  if (!configured) return DEFAULT_PUBLIC_LAUNCH_AT;
  const timestamp = Date.parse(configured);
  return Number.isFinite(timestamp) ? configured : DEFAULT_PUBLIC_LAUNCH_AT;
}

export function publicLaunchAtMs() {
  return Date.parse(publicLaunchAtIso());
}

export function isPublicLaunchOpen(nowMs = Date.now()) {
  return nowMs >= publicLaunchAtMs();
}
