import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeStandings } from "@/lib/tournament/standings";
import StandingsTable from "@/components/StandingsTable";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";
export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const group = await prisma.group.findFirst({ where: { slug }, include: { tournament: true, teams: { include: { group: true } } } });
  if (!group) notFound();
  const matchups = await prisma.matchup.findMany({ where: { tournamentId: group.tournamentId, groupLabel: group.name }, include: { homeTeam: true, awayTeam: true }, orderBy: { order: "asc" } });
  const standings = computeStandings(group.teams, matchups);
  return <main className="mx-auto max-w-7xl px-4 py-8"><AutoRefresh interval={5000}/><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="label">Group stage</div><h1 className="text-4xl font-black uppercase">{group.name}</h1></div><div className="flex gap-2">{["a","b","c"].map((item) => <Link key={item} href={`/groups/${item}`} className={`btn-ghost ${slug === item ? "border-court text-court" : ""}`}>Group {item.toUpperCase()}</Link>)}</div></div><section className="panel mt-6 overflow-hidden"><StandingsTable rows={standings}/></section><section className="mt-8"><div className="label">Six team matchups · seven games each</div><h2 className="text-2xl font-black uppercase">Schedule and results</h2><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{matchups.map((matchup) => <Link key={matchup.id} href={`/matches/${matchup.id}`} className="panel p-4 hover:border-court"><div className="flex justify-between gap-3"><span className="label">{matchup.roundLabel} · Court {matchup.courtLabel || "TBA"}</span><span className="text-xs font-bold">{matchup.status.replaceAll("_", " ")}</span></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><div><strong className="block text-lg">{matchup.homeTeam?.shortName || "TBD"}</strong><span className="text-xs text-gray-500">{matchup.homeTeam?.name}</span></div><div className="text-2xl font-black">{matchup.homeWins}-{matchup.awayWins}</div><div><strong className="block text-lg">{matchup.awayTeam?.shortName || "TBD"}</strong><span className="text-xs text-gray-500">{matchup.awayTeam?.name}</span></div></div></Link>)}</div></section></main>;
}
