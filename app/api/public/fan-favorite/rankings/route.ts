import { NextResponse } from "next/server";
import { getFanFavoriteSnapshot } from "@/lib/tournament/fan-favorite";
import { getPublishedTournamentId } from "@/lib/tournament/public-tournament";

export const dynamic = "force-dynamic";

export async function GET() {
  const tournamentId = await getPublishedTournamentId();
  if (!tournamentId) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });

  const snapshot = await getFanFavoriteSnapshot(tournamentId);
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Poll-Hint": snapshot.votingOpen ? "5000" : "12000",
    },
  });
}
