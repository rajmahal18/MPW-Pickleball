import { NextRequest, NextResponse } from "next/server";
import { attachAnonymousVisitorCookie, getAnonymousVisitor } from "@/lib/anonymous-visitor";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { requestData } from "@/lib/request";
import { getPublishedTournamentId } from "@/lib/tournament/public-tournament";
import { deviceTypeFromUserAgent, normalizeReferrerHost, normalizeTrackedPath } from "@/lib/visitor-analytics";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const visitor = getAnonymousVisitor(request);
  const respond = (body: Record<string, unknown>, status = 200) =>
    attachAnonymousVisitorCookie(NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } }), visitor);

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.nextUrl.host) return respond({ ok: true });
    } catch {
      return respond({ ok: true });
    }
  }

  const globalLimiter = checkRateLimit("public-analytics:global", 5000, 60_000);
  const visitorLimiter = checkRateLimit(`public-analytics:visitor:${visitor.key}`, 120, 60_000);
  if (!globalLimiter.allowed || !visitorLimiter.allowed) return respond({ ok: true });

  let input: Record<string, unknown>;
  try {
    input = await requestData(request);
  } catch {
    return respond({ ok: false }, 400);
  }

  const path = normalizeTrackedPath(input.path);
  if (!path) return respond({ ok: true });

  try {
    const tournamentId = await getPublishedTournamentId();
    if (!tournamentId) return respond({ ok: true });

    const recentDuplicate = await prisma.pageView.findFirst({
      where: { tournamentId, visitorKey: visitor.key, path, createdAt: { gt: new Date(Date.now() - 2_000) } },
      select: { id: true },
    });
    if (recentDuplicate) return respond({ ok: true });

    await prisma.pageView.create({
      data: {
        tournamentId,
        visitorKey: visitor.key,
        path,
        referrerHost: normalizeReferrerHost(input.referrerHost, request.nextUrl.hostname),
        deviceType: deviceTypeFromUserAgent(request.headers.get("user-agent")),
      },
    });
  } catch {
    return respond({ ok: true });
  }

  return respond({ ok: true }, 201);
}
