export const SESSION_COOKIE = "mpw_session";

export function sessionSecretBytes() {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return new TextEncoder().encode(value);
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must contain at least 32 characters in production.");
  return new TextEncoder().encode("local-development-secret-change-me-32-chars");
}
