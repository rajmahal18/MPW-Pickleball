import { Heart, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import FanFavoriteExperience from "@/components/FanFavoriteExperience";

export const dynamic = "force-dynamic";

export default async function FanFavorite({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  const players = tournament ? await prisma.player.findMany({
    where: { tournamentId: tournament.id, isActive: true, participationStatus: "CONFIRMED", teamId: { not: null }, team: { division: { isPublic: true } } },
    include: { team: true },
    orderBy: [{ sex: "asc" }, { team: { shortName: "asc" } }, { firstName: "asc" }],
  }) : [];
  const eligiblePlayers = players.filter((player) => player.team).map((player) => ({ ...player, team: player.team! }));

  return <main className="public-page mx-auto max-w-7xl px-4 py-6 md:py-10">
    <section className="mb-6 flex flex-col gap-4 border-b border-line pb-6 md:mb-8 md:flex-row md:items-end md:justify-between md:pb-8">
      <div className="max-w-3xl"><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-flame"><Sparkles className="h-4 w-4"/> Just for fun. Powered by the crowd.</div><h1 className="mt-2 text-4xl font-black tracking-[-.04em] text-ink md:text-6xl">Fan Favorite <span className="text-flame">♥</span></h1><p className="mt-3 max-w-2xl text-sm font-medium text-gray-500 md:text-base">The stats can pick an MVP. This one belongs to the people. Use the one-time code on your attendance card and choose the players you’re rooting for.</p></div>
      <div className="hidden items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-black text-ink md:flex"><Heart className="h-4 w-4 text-flame" fill="currentColor"/> Two picks. One crowd.</div>
    </section>
    <FanFavoriteExperience players={eligiblePlayers} initialCode={query.code || ""}/>
  </main>;
}
