import { randomInt } from "node:crypto";
import { Heart } from "lucide-react";
import { prisma } from "@/lib/prisma";
import FanFavoriteExperience from "@/components/FanFavoriteExperience";
import { getFanFavoriteSnapshot } from "@/lib/tournament/fan-favorite";
import { getPublicVotingCodeSnapshot } from "@/lib/tournament/fan-favorite-codes";
import { recognitionDivisionSlug } from "@/lib/tournament/recognition-division";

export const dynamic = "force-dynamic";

export default async function FanFavorite({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({
    where: { isPublished: true },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const [players, initialSnapshot, initialCodeSnapshot] = tournament ? await Promise.all([
    prisma.player.findMany({
      where: {
        tournamentId: tournament.id,
        isActive: true,
        participationStatus: "CONFIRMED",
        teamId: { not: null },
        team: { division: { isPublic: true, entrantType: "TEAM", slug: recognitionDivisionSlug() } },
      },
      select: {
        id: true,
        firstName: true,
        middleInitial: true,
        lastName: true,
        displayName: true,
        avatarUrl: true,
        sex: true,
        team: { select: { id: true, name: true, shortName: true, logoUrl: true, brandingPrimary: true, brandingSecondary: true, brandingAccent: true, brandingText: true, brandingSurface: true } },
      },
      orderBy: [{ sex: "asc" }, { team: { shortName: "asc" } }, { firstName: "asc" }],
    }),
    getFanFavoriteSnapshot(tournament.id),
    getPublicVotingCodeSnapshot(tournament.id),
  ]) : [[], undefined, undefined];

  const eligiblePlayers = shuffleForPageLoad(players.filter((player) => player.team).map((player) => ({
    ...player,
    team: player.team!,
  })));

  return <main className="public-page mx-auto max-w-[1500px] px-4 py-6 md:px-5 md:py-10">
    <section className="mb-6 flex flex-col gap-4 border-b border-line pb-6 md:mb-8 md:flex-row md:items-end md:justify-between md:pb-8">
      <div className="max-w-3xl"><div className="text-[11px] font-black uppercase tracking-[.18em] text-flame">Public voting</div><h1 className="mt-2 text-4xl font-black tracking-[-.04em] text-ink md:text-6xl">Fan Favorite <span className="text-flame">♥</span></h1></div>
      <div className="hidden items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-black text-ink md:flex"><Heart className="h-4 w-4 text-flame" fill="currentColor"/> One male and one female vote</div>
    </section>
    <FanFavoriteExperience players={eligiblePlayers} initialCode={query.code || ""} initialSnapshot={initialSnapshot} initialCodeSnapshot={initialCodeSnapshot}/>
  </main>;
}


function shuffleForPageLoad<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
