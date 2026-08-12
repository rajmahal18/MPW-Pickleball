import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";

export const dynamic = "force-dynamic";

export async function GET() {
  const tournament = await prisma.tournament.findFirst({
    where: { isPublished: true },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const revision = tournament ? await getPublicTournamentRevision(tournament.id) : "none:0";
  return NextResponse.json(
    { revision },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
