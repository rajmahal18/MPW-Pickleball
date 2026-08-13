import { NextResponse } from "next/server";
import { getLatestPublishedPublicTournamentRevision } from "@/lib/tournament/revision";

export const dynamic = "force-dynamic";

export async function GET() {
  const revision = await getLatestPublishedPublicTournamentRevision();
  return NextResponse.json(
    { revision },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
