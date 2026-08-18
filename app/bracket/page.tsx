import { prisma } from "@/lib/prisma";
import TournamentSync from "@/components/TournamentSync";
import BracketBoard, { KNOCKOUT_STAGES } from "@/components/BracketBoard";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import { winsNeededForMatchup } from "@/lib/tournament/rules";
import EventTabs from "@/components/EventTabs";

export const dynamic = "force-dynamic";

function knockoutSeriesLabel(matches: number) {
  return `Best of ${matches} · first to ${winsNeededForMatchup("FINAL", matches)}`;
}

export default async function Bracket({ searchParams }: { searchParams: Promise<{ success?: string; division?: string }> }) {
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  const allDivisions = tournament ? await prisma.division.findMany({
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
  const selected = allDivisions.find((division) => division.slug === query.division || division.id === query.division) ?? allDivisions[0] ?? null;
  const divisions = selected ? [selected] : [];
  const revision = tournament ? await getPublicTournamentRevision(tournament.id) : "none:0";

  return <main className="public-page mx-auto max-w-[1600px] px-4 py-3 md:py-8">
    <TournamentSync initialRevision={revision} />
    {query.success && <div className="mb-5 border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{query.success}</div>}
    <section className="public-hero"><div><div className="public-kicker">Knockout stage</div><h1 className="public-title">Bracket</h1><p className="public-lede">Follow the road to the title. Green marks winners, red marks eliminated sides, and the crown stays with the Grand Final champion.</p></div></section>
    <EventTabs divisions={allDivisions} activeId={selected?.id ?? ""} basePath="/bracket"/>

    <div className="mt-4 space-y-5 md:mt-8 md:space-y-8">
      {divisions.map((division) => <section key={division.id} className="panel overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line bg-gray-50/70 px-4 py-3 md:px-5 md:py-4">
          <div>
            <div className="label text-court">{division.formatType.replaceAll("_", " ")}</div>
            <h2 className="text-xl font-black uppercase md:text-2xl">{division.name}</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto text-[10px] font-black uppercase md:flex-wrap md:text-xs">
            <span className="shrink-0 border border-line bg-paper px-3 py-2">{division.matchups.length} knockout matchup{division.matchups.length === 1 ? "" : "s"}</span>
            <span className="shrink-0 border border-line bg-paper px-3 py-2">{knockoutSeriesLabel(division.knockoutGamesPerMatchup ?? division.defaultGamesPerMatchup)}</span>
            {division.thirdPlaceEnabled && <span className="shrink-0 border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">Battle for 3rd on</span>}
          </div>
        </div>
        {division.matchups.length ? <BracketBoard matchups={division.matchups} /> : <div className="p-8 text-center text-sm text-gray-500">No knockout matchups are configured yet for this division.</div>}
      </section>)}
    </div>
    {!divisions.length && <div className="panel mt-8 p-10 text-center text-gray-500">No public event is configured.</div>}
  </main>;
}
