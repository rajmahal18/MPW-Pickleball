import { prisma } from "@/lib/prisma";
import TournamentSync from "@/components/TournamentSync";
import BracketBoard, { KNOCKOUT_STAGES } from "@/components/BracketBoard";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";

export const dynamic = "force-dynamic";

export default async function Bracket({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  const divisions = tournament ? await prisma.division.findMany({
    where: { tournamentId: tournament.id, isPublic: true },
    include: {
      matchups: {
        where: { stage: { in: [...KNOCKOUT_STAGES] } },
        include: { homeTeam: true, awayTeam: true, winnerTeam: true },
        orderBy: [{ stage: "asc" }, { order: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  }) : [];
  const revision = tournament ? await getPublicTournamentRevision(tournament.id) : "none:0";

  return <main className="mx-auto max-w-[1600px] px-4 py-8">
    <TournamentSync initialRevision={revision} />
    {query.success && <div className="mb-5 border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{query.success}</div>}
    <div className="label">Knockout stage</div>
    <h1 className="text-4xl font-black uppercase">Bracket</h1>
    <p className="mt-2 max-w-3xl text-sm text-gray-600">Configured knockout matchups are shown by division. Future slots stay TBD until qualification is resolved.</p>

    <div className="mt-8 space-y-8">
      {divisions.map((division) => <section key={division.id} className="border border-line bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="label text-court">{division.formatType.replaceAll("_", " ")}</div>
            <h2 className="text-2xl font-black uppercase">{division.name}</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black uppercase">
            <span className="border border-line bg-paper px-3 py-2">{division.matchups.length} knockout matchup{division.matchups.length === 1 ? "" : "s"}</span>
            <span className="border border-line bg-paper px-3 py-2">{division.knockoutGamesPerMatchup ?? division.defaultGamesPerMatchup} games / knockout</span>
            {division.thirdPlaceEnabled && <span className="border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">Battle for 3rd on</span>}
          </div>
        </div>
        {division.matchups.length ? <BracketBoard matchups={division.matchups} /> : <div className="p-8 text-center text-sm text-gray-500">No knockout matchups are configured yet for this division.</div>}
      </section>)}
    </div>
    {!divisions.length && <div className="panel mt-8 p-10 text-center text-gray-500">No public divisions are configured.</div>}
  </main>;
}
