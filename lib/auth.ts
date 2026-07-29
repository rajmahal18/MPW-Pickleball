import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/prisma";

const COOKIE = "rverse_session";

function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return new TextEncoder().encode(value);
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must contain at least 32 characters in production.");
  return new TextEncoder().encode("local-development-secret-change-me-32-chars");
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(sessionSecret());
  const store = await cookies();
  store.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (typeof payload.userId !== "string") return null;
    return prisma.user.findUnique({ where: { id: payload.userId }, include: { team: true, player: true } });
  } catch {
    return null;
  }
}
