import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const tournament = await prisma.tournament.findFirst({
    where: { isPublished: true },
    orderBy: { createdAt: "desc" },
    include: {
      divisions: {
        where: { isPublic: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          teams: {
            orderBy: [{ group: { name: "asc" } }, { groupPosition: "asc" }, { shortName: "asc" }],
            include: {
              group: true,
              players: {
                where: { isActive: true, participationStatus: "CONFIRMED" },
                select: { id: true, divisionEntries: { where: { status: "CONFIRMED" }, select: { divisionId: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!tournament) return <main className="public-page mx-auto max-w-7xl px-4 py-8">No published tournament.</main>;
  const totalTeams = tournament.divisions.reduce((total, division) => total + division.teams.length, 0);

  return <main className="public-page mx-auto max-w-7xl px-4 py-6 md:py-10">
    <section className="public-hero">
      <div>
        <div className="public-kicker">Tournament field</div>
        <h1 className="public-title">Teams</h1>
        <p className="public-lede">Browse every public team, its division, group, and confirmed roster.</p>
      </div>
      <div className="public-count"><strong>{totalTeams}</strong><span>teams</span></div>
    </section>

    {tournament.divisions.length ? <div className="mt-7 space-y-9">
      {tournament.divisions.map((division) => <section key={division.id}>
        <div className="public-section-heading">
          <div><div className="public-kicker">Division</div><h2 className="text-2xl font-black">{division.name}</h2></div>
          <span className="text-xs font-bold text-gray-500">{division.teams.length} team{division.teams.length === 1 ? "" : "s"}</span>
        </div>
        {division.teams.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {division.teams.map((team) => {
            const confirmedPlayers = team.players.filter((player) => player.divisionEntries.some((entry) => entry.divisionId === division.id)).length;
            return <article key={team.id} className="public-card flex min-h-44 flex-col">
              <div className="flex items-start gap-3">
                {team.logoUrl
                  ? <img src={team.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full border border-line bg-white object-contain p-1"/>
                  : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-court/20 bg-court/10 text-xs font-black text-court">{team.shortName.slice(0, 3)}</div>}
                <div className="min-w-0 flex-1">
                  <Link href={`/teams/${team.id}`} className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-court">{team.shortName}</Link>
                  <h3 className="mt-0.5 text-lg font-black leading-tight"><Link href={`/teams/${team.id}`} className="hover:text-court">{team.name}</Link></h3>
                  {team.group ? <Link href={`/groups/${team.group.slug}`} className="mt-1 inline-block text-xs font-bold text-gray-500 hover:text-court">{team.group.name}</Link> : <div className="mt-1 text-xs font-bold text-gray-400">No group</div>}
                </div>
              </div>
              <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
                <div><div className="text-2xl font-black text-court">{confirmedPlayers}</div><div className="text-[9px] font-black uppercase tracking-widest text-gray-500">confirmed players</div></div>
                <Link href={`/teams/${team.id}`} className="btn-ghost min-h-10 rounded-lg px-3 py-2 text-xs">View team</Link>
              </div>
            </article>;
          })}
        </div> : <div className="public-empty mt-4">No public teams are configured in this division yet.</div>}
      </section>)}
    </div> : <div className="public-empty mt-6">No public divisions are configured right now.</div>}
  </main>;
}
