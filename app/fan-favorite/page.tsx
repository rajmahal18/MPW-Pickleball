import { Heart } from "lucide-react";
import { prisma } from "@/lib/prisma";
import FanFavoriteExperience, { type FanFavoriteSnapshot } from "@/components/FanFavoriteExperience";

export const dynamic = "force-dynamic";

export default async function FanFavorite({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  const players = tournament ? await prisma.player.findMany({
    where: { tournamentId: tournament.id, isActive: true, participationStatus: "CONFIRMED", teamId: { not: null }, team: { division: { isPublic: true } } },
    include: { team: true },
    orderBy: [{ sex: "asc" }, { team: { shortName: "asc" } }, { firstName: "asc" }],
  }) : [];
  const eligiblePlayers = players.filter((player) => player.team).map((player) => ({
    id: player.id,
    firstName: player.firstName,
    middleInitial: player.middleInitial,
    lastName: player.lastName,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    sex: player.sex,
    team: { name: player.team!.name, shortName: player.team!.shortName },
  }));
  const voteGroups = tournament ? await prisma.fanVote.groupBy({
    by: ["playerId", "sexCategory"],
    where: { tournamentId: tournament.id },
    _count: { _all: true },
    orderBy: [{ sexCategory: "asc" }, { _count: { playerId: "desc" } }, { playerId: "asc" }],
  }) : [];
  const playerById = new Map(eligiblePlayers.map((player) => [player.id, player]));
  const publicVotes = voteGroups.filter((row) => playerById.has(row.playerId));
  const maleTotal = publicVotes.filter((row) => row.sexCategory === "MALE").reduce((sum, row) => sum + row._count._all, 0);
  const femaleTotal = publicVotes.filter((row) => row.sexCategory === "FEMALE").reduce((sum, row) => sum + row._count._all, 0);
  const rankingsFor = (sexCategory: "MALE" | "FEMALE", total: number) => {
    let previousVotes = -1;
    let currentRank = 0;
    return publicVotes.filter((row) => row.sexCategory === sexCategory).map((row, index) => {
      const votes = row._count._all;
      if (votes !== previousVotes) currentRank = index + 1;
      previousVotes = votes;
      return { rank: currentRank, votes, percentage: total ? Math.round((votes / total) * 1000) / 10 : 0, player: playerById.get(row.playerId) };
    });
  };
  const initialSnapshot: FanFavoriteSnapshot = {
    votingOpen: Boolean(tournament?.votingOpen && (!tournament.votingDeadline || tournament.votingDeadline > new Date())),
    votingDeadline: tournament?.votingDeadline?.toISOString() ?? null,
    totalVotes: maleTotal + femaleTotal,
    totalsBySex: { male: maleTotal, female: femaleTotal },
    rankingsBySex: { male: rankingsFor("MALE", maleTotal), female: rankingsFor("FEMALE", femaleTotal) },
    updatedAt: new Date().toISOString(),
  };

  return <main className="public-page mx-auto max-w-7xl px-4 py-6 md:py-10">
    <section className="mb-6 flex flex-col gap-4 border-b border-line pb-6 md:mb-8 md:flex-row md:items-end md:justify-between md:pb-8">
      <div className="max-w-3xl"><div className="text-[11px] font-black uppercase tracking-[.18em] text-flame">Public voting</div><h1 className="mt-2 text-4xl font-black tracking-[-.04em] text-ink md:text-6xl">Fan Favorite <span className="text-flame">♥</span></h1></div>
      <div className="hidden items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-black text-ink md:flex"><Heart className="h-4 w-4 text-flame" fill="currentColor"/> One male and one female vote</div>
    </section>
    <FanFavoriteExperience players={eligiblePlayers} initialCode={query.code || ""} initialSnapshot={initialSnapshot}/>
  </main>;
}
