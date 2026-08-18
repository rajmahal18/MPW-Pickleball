import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "@/lib/request";

export function middleware(request: NextRequest) {
  // Public pages and APIs are intentionally available before tournament start.
  // The old countdown route is retained only as a legacy URL and redirects home.
  if (request.nextUrl.pathname === "/countdown") {
    return NextResponse.redirect(publicUrl(request, "/"));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff|woff2|ttf)$).*)"],
};
