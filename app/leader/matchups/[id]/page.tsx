import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FlashMessage from "@/components/FlashMessage";

export const dynamic = "force-dynamic";
export default async function Lineup({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser(); if (!user || user.role !== "TEAM_LEADER" || !user.teamId) redirect("/login");
  const { id } = await params; const query = await searchParams;
  const matchup = await prisma.matchup.findUnique({ where: { id }, include: { homeTeam: true, awayTeam: true, lineups: { include: { slots: true } }, games: true } });
  if (!matchup || ![matchup.homeTeamId, matchup.awayTeamId].includes(user.teamId)) notFound();
  if (matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore || game.awayScore)) redirect("/leader?error=Lineup+is+locked");
  const pairs = await prisma.pair.findMany({ where: { teamId: user.teamId, isActive: true }, include: { playerA: true, playerB: true }, orderBy: { label: "asc" } });
  const current = matchup.lineups.find((lineup) => lineup.teamId === user.teamId);
  return <main className="mx-auto max-w-3xl px-4 py-8"><FlashMessage error={query.error}/><div className="label">Lineup submission</div><h1 className="text-3xl font-black uppercase">{matchup.homeTeam?.name} vs {matchup.awayTeam?.name}</h1><p className="mt-2 text-sm text-gray-500">Assign each registered pair to exactly one game slot. The server validates pair ownership and prevents a player from appearing twice.</p><form action={`/api/leader/matchups/${matchup.id}/lineup`} method="post" className="panel mt-6 divide-y divide-line">{Array.from({ length: 7 }, (_, index) => { const selected = current?.slots.find((slot) => slot.slot === index + 1)?.pairId; return <label className="grid items-center gap-3 p-4 md:grid-cols-[120px_1fr]" key={index}><span className="font-black uppercase">Game {index + 1}</span><select name={`slot_${index + 1}`} defaultValue={selected || pairs[index]?.id} className="border border-line p-3">{pairs.map((pair) => <option value={pair.id} key={pair.id}>{pair.label}: {pair.playerA.displayName || `${pair.playerA.firstName} ${pair.playerA.lastName}`} / {pair.playerB.displayName || `${pair.playerB.firstName} ${pair.playerB.lastName}`}</option>)}</select></label>; })}<div className="p-4"><button className="btn-primary w-full">Save lineup</button></div></form></main>;
}
