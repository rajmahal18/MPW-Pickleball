import { prisma } from "@/lib/prisma";
import FanFavoriteExperience from "@/components/FanFavoriteExperience";

export const dynamic = "force-dynamic";
export default async function FanFavorite({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  const players = tournament ? await prisma.player.findMany({
    where: { isActive: true, team: { group: { tournamentId: tournament.id } } },
    include: { team: true },
    orderBy: [{ team: { shortName: "asc" } }, { firstName: "asc" }],
  }) : [];
  return <main className="mx-auto max-w-7xl px-4 py-8"><div className="label">Public voting</div><h1 className="text-4xl font-black uppercase md:text-5xl">Fan Favorite</h1><p className="mb-6 mt-2 max-w-3xl text-gray-600">Use the one-time code printed on your attendance card. The code is consumed atomically after one valid vote, while rankings stay live for the crowd.</p><FanFavoriteExperience players={players} initialCode={query.code || ""} /></main>;
}
