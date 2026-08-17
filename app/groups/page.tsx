import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { areGroupMatchupsComplete, computeStandings, qualificationOutcomes } from "@/lib/tournament/standings";
import StandingsTable from "@/components/StandingsTable";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";

export const dynamic = "force-dynamic";

export default async function GroupsIndexPage() {
  const tournament = await prisma.tournament.findFirst({
    where: { isPublished: true },
    orderBy: { createdAt: "desc" },
    include: {
      divisions: {
        where: { isPublic: true },
        include: {
          groups: {
            include: { standingOverrides: true, teams: { include: { group: true }, orderBy: { shortName: "asc" } } },
            orderBy: { name: "asc" },
          },
          matchups: { where: { stage: "GROUP" }, include: { games: { select: { homeScore: true, awayScore: true, status: true } } }, orderBy: { order: "asc" } },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
  });

  if (!tournament) return <main className="public-page mx-auto max-w-7xl px-4 py-3 md:py-8">No published tournament.</main>;
  const divisions = tournament.divisions.filter((division) => division.groups.length > 0);
  const revision = await getPublicTournamentRevision(tournament.id);

  return (
    <main className="public-page mx-auto max-w-7xl px-4 py-3 md:py-8">
      <TournamentSync initialRevision={revision} />
      <section className="public-hero"><div><div className="public-kicker">Group stage</div><h1 className="public-title">Groups</h1><p className="public-lede">See the race at a glance. Once group play is final, green teams advance and red teams are eliminated.</p></div><Link href="/format" className="btn-ghost hidden rounded-lg md:inline-flex">Format guide</Link></section>

      {divisions.length ? (
        <div className="mt-4 space-y-6 md:mt-7 md:space-y-8">
          {divisions.map((division) => {
            const tables = division.groups.map((group) => computeStandings(group.teams, division.matchups.filter((matchup) => matchup.groupLabel === group.name), group.standingOverrides));
            const qualificationByTeam = division.formatType === "GROUP_KNOCKOUT" ? qualificationOutcomes(tables, division.qualifiersPerGroup, division.wildcardCount, { groupStageComplete: areGroupMatchupsComplete(division.matchups) }) : new Map();
            return <section key={division.id}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div><div className="public-kicker">Division</div><h2 className="text-2xl font-black">{division.name}</h2></div>
                {qualificationByTeam.size > 0 && <div className="flex gap-2 text-[10px] font-black uppercase tracking-wider"><span className="border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-800">Green = through</span><span className="border border-red-300 bg-red-50 px-2 py-1 text-red-800">Red = out</span></div>}
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                {division.groups.map((group, index) => <article key={group.id} className="panel min-w-0 overflow-hidden"><div className="flex items-center justify-between border-b border-line bg-gray-50/70 p-4"><div><div className="label text-court">{division.name}</div><h3 className="text-lg font-black">{group.name}</h3></div><Link href={`/groups/${group.slug}`} className="btn-ghost rounded-lg px-3 py-2 text-xs">Open group</Link></div><StandingsTable rows={tables[index] ?? []} qualificationByTeam={qualificationByTeam}/></article>)}
              </div>
            </section>;
          })}
        </div>
      ) : (
        <div className="public-empty mt-6">No public group-stage divisions are configured right now.</div>
      )}
    </main>
  );
}
