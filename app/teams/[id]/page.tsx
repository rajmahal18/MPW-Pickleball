import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PlayerAvatar from "@/components/PlayerAvatar";
import { formatPlayerDisplayName } from "@/lib/player-name";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await prisma.team.findFirst({
    where: { id, division: { isPublic: true, tournament: { isPublished: true } } },
    include: {
      group: true,
      division: true,
      players: {
        where: { isActive: true, participationStatus: "CONFIRMED" },
        include: { divisionEntries: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      },
    },
  });
  if (!team) notFound();

  const players = team.players.filter((player) => player.divisionEntries.some((entry) => entry.divisionId === team.divisionId && entry.status === "CONFIRMED"));
  return <main className="public-page mx-auto max-w-5xl px-4 py-5 md:py-8">
    <section className="public-hero"><div><div className="public-kicker">{team.division.name}{team.group ? ` · ${team.group.name}` : ""}</div><h1 className="public-title">{team.name}</h1><p className="public-lede"><span className="font-bold text-ink">{players.length} confirmed player{players.length === 1 ? "" : "s"}</span><span className="hidden md:inline"> · Playing pairs are submitted per matchup.</span></p></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right"><strong className="text-2xl font-black text-emerald-700">{players.length}</strong><div className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Active roster</div></div></section>
    <div className="mt-5 grid grid-cols-2 gap-3 md:mt-6 md:gap-4 lg:grid-cols-3">{players.map((player) => <Link key={player.id} href={`/players/${player.id}`} className="public-card group p-3 text-center md:p-5"><Player player={player}/><div className="mt-3 text-[9px] font-black uppercase tracking-widest text-court opacity-60 group-hover:opacity-100">View profile →</div></Link>)}</div>
    {!players.length && <div className="panel mt-6 p-8 text-center text-gray-500">No confirmed public players are currently assigned to this team.</div>}
  </main>;
}

function Player({ player }: { player: { firstName: string; middleInitial?: string | null; lastName: string; displayName: string | null; avatarUrl: string | null; sex: string } }) {
  return <div className="text-center"><div className="mx-auto w-fit"><PlayerAvatar {...player} size="lg"/></div><div className="mt-3 font-black leading-tight">{formatPlayerDisplayName(player)}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">{player.sex}</div></div>;
}
