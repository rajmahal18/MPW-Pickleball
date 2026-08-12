import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, requestIp } from "@/lib/request";
import { hashNetworkIdentifier } from "@/lib/tournament/voting";

export async function POST(request: Request) {
  assertSameOrigin(request);
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const limiter = checkRateLimit(`login:${hashNetworkIdentifier(requestIp(request))}`, 10, 5 * 60_000);
  if (!limiter.allowed) return NextResponse.redirect(new URL("/login?error=Too+many+login+attempts", request.url), 303);
  if (!email || password.length < 6) return NextResponse.redirect(new URL("/login?error=Invalid+credentials", request.url), 303);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.redirect(new URL("/login?error=Invalid+credentials", request.url), 303);
  }
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",").at(0)?.trim();
  const secureCookie = (forwardedProto || new URL(request.url).protocol.replace(":", "")) === "https";
  await createSession(user.id, secureCookie);
  return NextResponse.redirect(new URL(user.role === "ADMIN" ? "/admin" : "/leader", request.url), 303);
}
