import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const ANONYMOUS_VISITOR_COOKIE = "mpw_vid";
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{20,80}$/;
const VISITOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type AnonymousVisitor = {
  rawId: string;
  key: string;
  isNew: boolean;
};

export function getAnonymousVisitor(request: NextRequest): AnonymousVisitor {
  const supplied = request.cookies.get(ANONYMOUS_VISITOR_COOKIE)?.value?.trim() || "";
  const rawId = VISITOR_ID_PATTERN.test(supplied) ? supplied : randomBytes(24).toString("base64url");
  return {
    rawId,
    key: createHash("sha256").update(rawId).digest("hex"),
    isNew: rawId !== supplied,
  };
}

export function attachAnonymousVisitorCookie(response: NextResponse, visitor: AnonymousVisitor) {
  if (!visitor.isNew) return response;
  response.cookies.set(ANONYMOUS_VISITOR_COOKIE, visitor.rawId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VISITOR_MAX_AGE_SECONDS,
  });
  return response;
}
