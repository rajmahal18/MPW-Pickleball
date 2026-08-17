import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getVotingAdminSnapshot } from "@/lib/tournament/voting-dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!tournament) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  return NextResponse.json(await getVotingAdminSnapshot(tournament.id), { headers: { "Cache-Control": "no-store, max-age=0" } });
}
