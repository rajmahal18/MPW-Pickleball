const PUBLIC_PATH_PATTERN = /^\/[A-Za-z0-9/_-]*$/;

export function normalizeTrackedPath(input: unknown) {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value || value.length > 180 || !PUBLIC_PATH_PATTERN.test(value)) return null;
  if (value === "/login" || value.startsWith("/admin") || value.startsWith("/leader") || value.startsWith("/api")) return null;
  return value.replace(/\/{2,}/g, "/") || "/";
}

export function normalizeReferrerHost(input: unknown, siteHost: string) {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!value) return null;
  try {
    const host = new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
    if (!host || host === siteHost.toLowerCase()) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

export function deviceTypeFromUserAgent(userAgent: string | null) {
  const value = (userAgent || "").toLowerCase();
  if (/ipad|tablet|kindle|silk/.test(value)) return "TABLET";
  if (/mobi|android|iphone|ipod/.test(value)) return "MOBILE";
  return "DESKTOP";
}
