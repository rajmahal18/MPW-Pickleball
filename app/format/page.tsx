import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { buildDivisionGuide } from "@/lib/tournament/format-guide";

export const dynamic = "force-dynamic";

function StatBox({ label, value }: { label: string; value: string | number }) {
  return <div className="border border-line bg-white px-4 py-3"><div className="label text-court">{label}</div><div className="mt-1 text-2xl font-black text-ink">{value}</div></div>;
}

export default async function FormatPage() {
  const tournament = await prisma.tournament.findFirst({
    where: { isPublished: true },
    include: {
      divisions: {
        where: { isPublic: true },
        include: {
          groups: { include: { teams: true }, orderBy: { name: "asc" } },
          teams: { include: { pairs: { where: { isActive: true }, select: { playerAId: true, playerBId: true, isActive: true } } } },
          matchups: { orderBy: [{ stage: "asc" }, { order: "asc" }] },
          playerEntries: { include: { player: { include: { team: { select: { divisionId: true } } } } } },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!tournament) return <main className="public-page mx-auto max-w-7xl px-4 py-5 md:py-8">Run the seed script first.</main>;

  const [playerCount, teamCount, gameCount] = await Promise.all([
    prisma.player.count({ where: { tournamentId: tournament.id, isActive: true, participationStatus: "CONFIRMED", divisionEntries: { some: { status: "CONFIRMED", division: { isPublic: true } } } } }),
    prisma.team.count({ where: { division: { tournamentId: tournament.id, isPublic: true } } }),
    prisma.game.count({ where: { matchup: { tournamentId: tournament.id, division: { isPublic: true } } } }),
  ]);

  return <main className="public-page mx-auto max-w-7xl px-4 py-5 md:py-8">
    <div className="label text-court">Live tournament configuration</div><h1 className="text-3xl font-black uppercase text-ink md:text-4xl">Format Guide</h1>
    <p className="mt-2 hidden max-w-4xl text-sm text-gray-600 md:block">This guide is generated from the current tournament configuration. If organizers change a division, match count, team assignment, or future bracket structure, the public guide updates with it.</p>
    <section className="mt-5 grid grid-cols-2 gap-3 md:mt-6 md:gap-4 lg:grid-cols-4"><StatBox label="Divisions" value={tournament.divisions.length}/><StatBox label="Event entries" value={teamCount}/><StatBox label="Confirmed players" value={playerCount}/><StatBox label="Matches created" value={gameCount}/></section>

    <div className="mt-6 space-y-6">{tournament.divisions.map((division) => { const guide = buildDivisionGuide(division); return <section key={division.id} className="overflow-hidden border border-line bg-white">
      <div className="border-l-4 border-gold bg-gradient-to-r from-gold/20 via-white to-court/10 p-4"><div className="label text-court">{guide.formatLabel}</div><div className="flex flex-wrap items-end justify-between gap-3"><h2 className="text-2xl font-black uppercase">{division.name}</h2><span className="text-xs font-black text-gray-500">{guide.confirmedPlayers} confirmed - {guide.assignedPlayers} assigned - {division.teams.length} {division.entrantType === "PAIR" ? "pairs" : "teams"}</span></div></div>
      {guide.stages.length > 0 && <div className="grid gap-px bg-line md:grid-cols-2 xl:grid-cols-4">{guide.stages.map((stage, index) => <div key={`${stage.title}-${index}`} className="bg-white p-4"><div className="label text-court">Stage {index + 1}</div><div className="font-black uppercase">{stage.title}</div><div className="mt-1 text-sm text-gray-600">{stage.detail}</div></div>)}</div>}
      <ul className="divide-y divide-line text-sm">{guide.rules.map((rule, index) => <li key={index} className="flex gap-3 px-4 py-3"><span className="mt-1 h-2 w-2 shrink-0 bg-gold"/><span>{rule}</span></li>)}</ul>
      {division.groups.length > 0 && <div className="border-t border-line p-4"><div className="label">Configured groups</div><div className="mt-2 flex flex-wrap gap-2">{division.groups.map((group) => <Link key={group.id} href={`/groups/${group.slug}`} className="btn-ghost px-3 py-2 text-xs">{group.name} - {group.teams.length} {division.entrantType === "PAIR" ? "pairs" : "teams"}</Link>)}</div></div>}
    </section>; })}</div>
    <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3"><Link href="/bracket" className="btn-primary">View knockout board</Link><Link href="/games" className="btn-ghost">View matches</Link><Link href="/players" className="btn-ghost">View player pool</Link></div>
  </main>;
}
