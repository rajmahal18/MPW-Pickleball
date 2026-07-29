import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FlashMessage from "@/components/FlashMessage";

export const dynamic = "force-dynamic";
export default async function Leader({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser(); if (!user || user.role !== "TEAM_LEADER" || !user.teamId) redirect("/login");
  const query = await searchParams;
  const matchups = await prisma.matchup.findMany({ where: { OR: [{ homeTeamId: user.teamId }, { awayTeamId: user.teamId }] }, include: { homeTeam: true, awayTeam: true, lineups: true, games: true }, orderBy: { order: "asc" } });
  return <main className="mx-auto max-w-5xl px-4 py-8"><FlashMessage {...query}/><div className="flex justify-between gap-3"><div><div className="label">Team leader portal</div><h1 className="text-4xl font-black uppercase">{user.team?.name}</h1><p className="mt-1 text-sm text-gray-500">Submit each of seven active pairs once per team matchup.</p></div><form action="/api/auth/logout" method="post"><button className="btn-ghost">Logout</button></form></div><div className="mt-6 space-y-3">{matchups.map((matchup) => { const submitted = matchup.lineups.some((lineup) => lineup.teamId === user.teamId); const locked = matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore || game.awayScore); return <div className="panel flex flex-wrap items-center justify-between gap-3 p-4" key={matchup.id}><div><div className="label">{matchup.groupLabel || matchup.stage} · {matchup.roundLabel} · {matchup.status.replaceAll("_", " ")}</div><div className="font-black">{matchup.homeTeam?.name} vs {matchup.awayTeam?.name}</div></div>{locked ? <span className="bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600">Lineup locked</span> : <Link className={submitted ? "btn-ghost" : "btn-primary"} href={`/leader/matchups/${matchup.id}`}>{submitted ? "Edit lineup" : "Submit lineup"}</Link>}</div>; })}</div></main>;
}
