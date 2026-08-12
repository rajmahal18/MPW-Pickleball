import { cookies } from "next/headers";
import { cache } from "react";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/prisma";

const COOKIE = "mpw_session";

function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return new TextEncoder().encode(value);
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must contain at least 32 characters in production.");
  return new TextEncoder().encode("local-development-secret-change-me-32-chars");
}

export async function createSession(userId: string, secureCookie = process.env.NODE_ENV === "production") {
  const token = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(sessionSecret());
  const store = await cookies();
  store.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookie, path: "/", maxAge: 60 * 60 * 24 * 7 });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export const getCurrentUser = cache(async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (typeof payload.userId !== "string") return null;
    return prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, email: true, role: true, teamId: true, playerId: true, team: { select: { id: true, name: true, shortName: true } } },
    });
  } catch {
    return null;
  }
});
