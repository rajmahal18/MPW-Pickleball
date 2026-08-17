import { NextResponse } from "next/server";
import { getPublishedTournamentId } from "@/lib/tournament/public-tournament";
import { getPublicVotingCodeSnapshot } from "@/lib/tournament/fan-favorite-codes";

export const dynamic = "force-dynamic";

export async function GET() {
  const tournamentId = await getPublishedTournamentId();
  if (!tournamentId) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  const snapshot = await getPublicVotingCodeSnapshot(tournamentId);
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Poll-Hint": "2500",
    },
  });
}
