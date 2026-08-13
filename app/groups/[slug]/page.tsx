import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { areGroupMatchupsComplete, computeStandings, qualificationOutcomes } from "@/lib/tournament/standings";
import StandingsTable from "@/components/StandingsTable";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";
export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const group = await prisma.group.findFirst({ where: { slug, tournament: { isPublished: true }, division: { isPublic: true } }, include: { tournament: true, division: true, standingOverrides: true, teams: { include: { group: true } } } });
  if (!group) notFound();
  const [matchups, divisionGroups, allGroupMatchups, revision] = await Promise.all([
    prisma.matchup.findMany({ where: { divisionId: group.divisionId, stage: "GROUP", groupLabel: group.name }, include: { homeTeam: true, awayTeam: true, games: { select: { homeScore: true, awayScore: true, status: true } } }, orderBy: [{ updatedAt: "desc" }, { order: "desc" }] }),
    prisma.group.findMany({ where: { divisionId: group.divisionId }, include: { standingOverrides: true, teams: { include: { group: true } } }, orderBy: { name: "asc" } }),
    prisma.matchup.findMany({ where: { divisionId: group.divisionId, stage: "GROUP" }, include: { games: { select: { homeScore: true, awayScore: true, status: true } } }, orderBy: { order: "asc" } }),
    getPublicTournamentRevision(group.tournamentId),
  ]);
  const standings = computeStandings(group.teams, matchups, group.standingOverrides);
  const tables = divisionGroups.map((item) => computeStandings(item.teams, allGroupMatchups.filter((matchup) => matchup.groupLabel === item.name), item.standingOverrides));
  const qualificationByTeam = group.division.formatType === "GROUP_KNOCKOUT" ? qualificationOutcomes(tables, group.division.qualifiersPerGroup, group.division.wildcardCount, { groupStageComplete: areGroupMatchupsComplete(allGroupMatchups) }) : new Map();
  const gameCounts = [...new Set(matchups.map((matchup) => matchup.gamesPerMatchup))];
  return <main className="public-page mx-auto max-w-7xl px-4 py-5 md:py-8"><TournamentSync initialRevision={revision}/><div className="public-hero"><div><div className="public-kicker">{group.division.name} · group stage</div><h1 className="public-title">{group.name}</h1><p className="public-lede">Standings, qualification status, and the latest matchup results for this group.</p></div><div className="flex flex-wrap gap-2">{divisionGroups.map((item) => <Link key={item.id} href={`/groups/${item.slug}`} className={`btn-ghost rounded-lg ${slug === item.slug ? "border-court bg-court/5 text-court" : ""}`}>{item.name}</Link>)}</div></div><section className="panel mt-6 overflow-hidden"><StandingsTable rows={standings} qualificationByTeam={qualificationByTeam}/></section><section className="mt-8"><div className="public-kicker">{matchups.length} matchups · {gameCounts.length === 1 ? `${gameCounts[0]} matches each` : "variable match counts"}</div><h2 className="mt-1 text-2xl font-black">Matchups & results</h2><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{matchups.map((matchup) => {
    const decided = matchup.status === "COMPLETED" || matchup.status === "FORFEITED";
    const homeWon = decided && matchup.homeWins > matchup.awayWins;
    const awayWon = decided && matchup.awayWins > matchup.homeWins;
    return <Link key={matchup.id} href={`/matches/${matchup.id}`} className={`public-card overflow-hidden p-0 ${matchup.status === "LIVE" ? "border-flame/50 ring-1 ring-flame/20" : ""}`}><div className="flex justify-between gap-3 border-b border-line bg-gray-50 px-4 py-3"><span className="label">{matchup.queuePosition !== null ? `Next #${matchup.queuePosition} · ` : ""}{matchup.roundLabel} · Court {matchup.courtLabel || "TBA"}</span><StatusBadge status={matchup.status} compact/></div><div className="grid grid-cols-[1fr_auto_1fr] items-stretch text-center"><div className={`p-4 ${homeWon ? "bg-emerald-50" : awayWon ? "bg-red-50/60" : ""}`}><strong className={`block text-lg ${homeWon ? "text-emerald-800" : ""}`}>{matchup.homeTeam?.shortName || "TBD"}</strong><span className="text-xs text-gray-500">{matchup.homeTeam?.name}</span>{homeWon && <div className="mt-2 text-[9px] font-black uppercase tracking-widest text-emerald-700">Winner</div>}</div><div className="grid place-items-center bg-ink px-3 text-2xl font-black text-white">{matchup.homeWins}–{matchup.awayWins}</div><div className={`p-4 ${awayWon ? "bg-emerald-50" : homeWon ? "bg-red-50/60" : ""}`}><strong className={`block text-lg ${awayWon ? "text-emerald-800" : ""}`}>{matchup.awayTeam?.shortName || "TBD"}</strong><span className="text-xs text-gray-500">{matchup.awayTeam?.name}</span>{awayWon && <div className="mt-2 text-[9px] font-black uppercase tracking-widest text-emerald-700">Winner</div>}</div></div></Link>;
  })}</div></section></main>;
}
