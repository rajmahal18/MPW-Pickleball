import { cookies } from "next/headers";
import { cache } from "react";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, sessionSecretBytes } from "@/lib/session-config";

export async function createSession(userId: string, secureCookie = process.env.NODE_ENV === "production") {
  const token = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(sessionSecretBytes());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookie, path: "/", maxAge: 60 * 60 * 24 * 7 });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecretBytes());
    if (typeof payload.userId !== "string") return null;
    return prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, email: true, role: true, teamId: true, playerId: true, team: { select: { id: true, name: true, shortName: true } } },
    });
  } catch {
    return null;
  }
});
