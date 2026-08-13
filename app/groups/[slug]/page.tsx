import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeStandings } from "@/lib/tournament/standings";
import StandingsTable from "@/components/StandingsTable";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";
export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const group = await prisma.group.findFirst({ where: { slug, tournament: { isPublished: true }, division: { isPublic: true } }, include: { tournament: true, division: true, standingOverrides: true, teams: { include: { group: true } } } });
  if (!group) notFound();
  const [matchups, siblings, revision] = await Promise.all([
    prisma.matchup.findMany({ where: { divisionId: group.divisionId, stage: "GROUP", groupLabel: group.name }, include: { homeTeam: true, awayTeam: true, games: { select: { homeScore: true, awayScore: true, status: true } } }, orderBy: [{ updatedAt: "desc" }, { order: "desc" }] }),
    prisma.group.findMany({ where: { divisionId: group.divisionId }, orderBy: { name: "asc" } }),
    getPublicTournamentRevision(group.tournamentId),
  ]);
  const standings = computeStandings(group.teams, matchups, group.standingOverrides);
  const gameCounts = [...new Set(matchups.map((matchup) => matchup.gamesPerMatchup))];
  return <main className="public-page mx-auto max-w-7xl px-4 py-5 md:py-8"><TournamentSync initialRevision={revision}/><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="label">{group.division.name} - group stage</div><h1 className="text-3xl font-black uppercase md:text-4xl">{group.name}</h1></div><div className="flex flex-wrap gap-2">{siblings.map((item) => <Link key={item.id} href={`/groups/${item.slug}`} className={`btn-ghost ${slug === item.slug ? "border-court text-court" : ""}`}>{item.name}</Link>)}</div></div><section className="panel mt-6 overflow-hidden"><StandingsTable rows={standings}/></section><section className="mt-8"><div className="label">{matchups.length} matchups - {gameCounts.length === 1 ? `${gameCounts[0]} matches each` : "variable match counts"}</div><h2 className="text-2xl font-black uppercase">Matchups and results</h2><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{matchups.map((matchup) => <Link key={matchup.id} href={`/matches/${matchup.id}`} className="panel p-4 hover:border-court"><div className="flex justify-between gap-3"><span className="label">{matchup.queuePosition !== null ? `Next #${matchup.queuePosition} - ` : ""}{matchup.roundLabel} - Court {matchup.courtLabel || "TBA"}</span><StatusBadge status={matchup.status} compact/></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><div><strong className="block text-lg">{matchup.homeTeam?.shortName || "TBD"}</strong><span className="text-xs text-gray-500">{matchup.homeTeam?.name}</span></div><div className="text-2xl font-black">{matchup.homeWins}-{matchup.awayWins}</div><div><strong className="block text-lg">{matchup.awayTeam?.shortName || "TBD"}</strong><span className="text-xs text-gray-500">{matchup.awayTeam?.name}</span></div></div></Link>)}</div></section></main>;
}
