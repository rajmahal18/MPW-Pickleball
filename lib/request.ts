export function requestIp(request: Request) {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "unknown"
  );
}

export function publicOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",").at(0)?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",").at(0)?.trim();
  const proto = forwardedProto || requestUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : requestUrl.origin;
}

export function publicUrl(request: Request, path: string) {
  return new URL(path, publicOrigin(request));
}

export function assertSameOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  const hostOrigin = publicOrigin(request);
  const supplied = request.headers.get("origin") || request.headers.get("referer");
  if (!supplied) return;
  let suppliedOrigin = "";
  try { suppliedOrigin = new URL(supplied).origin; } catch { throw new Error("Invalid request origin."); }
  if (suppliedOrigin !== requestOrigin && suppliedOrigin !== hostOrigin) throw new Error("Cross-origin mutation rejected.");
}

export async function requestData(request: Request) {
  assertSameOrigin(request);
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return (await request.json()) as Record<string, unknown>;
  const form = await request.formData();
  const data: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    const existing = data[key];
    if (existing === undefined) data[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else data[key] = [existing, value];
  }
  return data;
}

export function redirectBack(request: Request, fallback: string, params?: Record<string, string>) {
  const requestOrigin = new URL(request.url).origin;
  const hostOrigin = publicOrigin(request);
  let url = publicUrl(request, fallback);
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const candidate = new URL(referer);
      if (candidate.origin === hostOrigin || candidate.origin === requestOrigin) url = candidate;
    } catch {
      // Ignore malformed or cross-origin referrers and use the safe fallback.
    }
  }
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return url;
}
