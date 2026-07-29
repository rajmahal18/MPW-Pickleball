import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PlayerAvatar from "@/components/PlayerAvatar";

export const dynamic = "force-dynamic";
export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id }, include: { group: true, pairs: { where: { isActive: true }, include: { playerA: true, playerB: true }, orderBy: { label: "asc" } } } });
  if (!team) notFound();
  return <main className="mx-auto max-w-5xl px-4 py-8"><div className="label">{team.group.name}</div><h1 className="text-4xl font-black uppercase">{team.name}</h1><p className="mt-2 text-gray-500">Seven registered pairs. Each pair may appear once in a team matchup lineup.</p><div className="mt-6 grid gap-4 md:grid-cols-2">{team.pairs.map((pair) => <article key={pair.id} className="panel p-5"><div className="label">{pair.label}</div><div className="mt-4 grid grid-cols-2 gap-4"><Player player={pair.playerA}/><Player player={pair.playerB}/></div></article>)}</div></main>;
}
function Player({ player }: { player: any }) { return <div className="text-center"><div className="mx-auto w-fit"><PlayerAvatar {...player} size="lg"/></div><div className="mt-2 font-black">{player.displayName || `${player.firstName} ${player.lastName}`}</div><div className="text-xs text-gray-500">{player.sex}</div></div>; }
