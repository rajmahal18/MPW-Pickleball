import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.tournament.findFirst({ select: { id: true }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ ok: true, database: "ok", checkedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, database: "error", checkedAt: new Date().toISOString() }, { status: 503 });
  }
}
