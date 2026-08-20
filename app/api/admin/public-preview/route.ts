import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSuperadmin } from "@/lib/permissions";
import { PUBLIC_PREVIEW_COOKIE } from "@/lib/public-preview";
import { publicUrl, requestData } from "@/lib/request";

export async function POST(request: Request) {
  const user = await requireSuperadmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const data = await requestData(request);
  const enabled = String(data.enabled || "") === "1";
  const store = await cookies();
  if (enabled) store.set(PUBLIC_PREVIEW_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
  else store.delete(PUBLIC_PREVIEW_COOKIE);
  const destination = String(data.returnTo || "/groups");
  const safeDestination = destination.startsWith("/") && !destination.startsWith("//") && !destination.includes("\\") ? destination : "/groups";
  return NextResponse.redirect(publicUrl(request, safeDestination), 303);
}
