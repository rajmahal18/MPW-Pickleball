import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { recalculateTournament } from "@/lib/tournament/recalculate";
import { assertSameOrigin, redirectBack } from "@/lib/request";

export async function POST(request: Request) {
  assertSameOrigin(request);
  const user = await requireAdmin();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tournament) return new NextResponse("No tournament", { status: 404 });
  await prisma.$transaction(
    (tx) => recalculateTournament(tx, tournament.id, { actorId: user.id, reason: "Manual bracket refresh" }),
    { maxWait: 10000, timeout: 30000 },
  );
  return NextResponse.redirect(redirectBack(request, "/bracket", { success: "Tournament dependencies and supported automatic brackets refreshed." }), 303);
}
