import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicLaunchOpen } from "@/lib/public-launch";
import { publicUrl } from "@/lib/request";
import { SESSION_COOKIE, sessionSecretBytes } from "@/lib/session-config";

const ALWAYS_AVAILABLE = ["/login", "/api/auth", "/api/health"];
const PROTECTED_OPERATION_PREFIXES = ["/admin", "/leader", "/api/admin", "/api/leader"];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function hasSignedSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, sessionSecretBytes());
    return typeof payload.userId === "string" && payload.userId.length > 0;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const launchOpen = isPublicLaunchOpen();

  if (launchOpen) {
    if (pathname === "/countdown") return NextResponse.redirect(publicUrl(request, "/"));
    return NextResponse.next();
  }

  if (startsWithAny(pathname, ALWAYS_AVAILABLE) || startsWithAny(pathname, PROTECTED_OPERATION_PREFIXES)) {
    return NextResponse.next();
  }

  const authenticated = await hasSignedSession(request);
  if (authenticated) {
    if (pathname === "/countdown") return NextResponse.redirect(publicUrl(request, "/"));
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/public")) {
    return NextResponse.json({ error: "Public tournament access has not opened yet." }, { status: 403 });
  }

  if (pathname === "/countdown") return NextResponse.next();
  return NextResponse.redirect(publicUrl(request, "/countdown"));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff|woff2|ttf)$).*)"],
};
