export function requestIp(request: Request) {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "unknown"
  );
}

export function assertSameOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const supplied = request.headers.get("origin") || request.headers.get("referer");
  if (!supplied) return;
  let suppliedOrigin = "";
  try { suppliedOrigin = new URL(supplied).origin; } catch { throw new Error("Invalid request origin."); }
  if (suppliedOrigin !== requestOrigin) throw new Error("Cross-origin mutation rejected.");
}

export async function requestData(request: Request) {
  assertSameOrigin(request);
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return (await request.json()) as Record<string, unknown>;
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

export function redirectBack(request: Request, fallback: string, params?: Record<string, string>) {
  const requestUrl = new URL(request.url);
  let url = new URL(fallback, requestUrl);
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const candidate = new URL(referer);
      if (candidate.origin === requestUrl.origin) url = candidate;
    } catch {
      // Ignore malformed or cross-origin referrers and use the safe fallback.
    }
  }
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return url;
}
