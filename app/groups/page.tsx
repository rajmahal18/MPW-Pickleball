import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computeStandings } from "@/lib/tournament/standings";
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

  if (!tournament) return <main className="mx-auto max-w-7xl px-4 py-8">No published tournament.</main>;
  const divisions = tournament.divisions.filter((division) => division.groups.length > 0);
  const revision = await getPublicTournamentRevision(tournament.id);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <TournamentSync initialRevision={revision} />
      <div className="label text-court">Configured group stages</div>
      <h1 className="text-4xl font-black uppercase text-ink">Groups</h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-600">Groups shown here come from the live tournament configuration. Divisions without groups are handled by their own round-robin, knockout, or custom format.</p>

      {divisions.length ? (
        <div className="mt-6 space-y-7">
          {divisions.map((division) => (
            <section key={division.id}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="label">Division</div>
                  <h2 className="text-2xl font-black uppercase">{division.name}</h2>
                </div>
                <Link href="/format" className="text-xs font-bold text-court">View format guide →</Link>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                {division.groups.map((group) => {
                  const standings = computeStandings(
                    group.teams,
                    division.matchups.filter((matchup) => matchup.groupLabel === group.name),
                    group.standingOverrides,
                  );
                  return (
                    <article key={group.id} className="panel min-w-0 overflow-hidden">
                      <div className="flex items-center justify-between border-b border-line p-4">
                        <div>
                          <div className="label text-court">{division.name}</div>
                          <h3 className="text-lg font-black uppercase">{group.name}</h3>
                        </div>
                        <Link href={`/groups/${group.slug}`} className="btn-ghost px-3 py-2 text-xs">Open</Link>
                      </div>
                      <StandingsTable rows={standings} />
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-6 border border-dashed border-line bg-white p-8 text-center text-gray-500">No public group-stage divisions are configured right now.</div>
      )}
    </main>
  );
}
