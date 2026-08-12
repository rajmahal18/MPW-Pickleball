import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LiveMatchBoard from "@/components/LiveMatchBoard";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function MatchupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchup = await prisma.matchup.findFirst({
    where: { id, division: { isPublic: true }, tournament: { isPublished: true } },
    include: {
      division: true,
      homeTeam: true,
      awayTeam: true,
      games: {
        select: {
          id: true, gameNumber: true, homeScore: true, awayScore: true, status: true, winnerTeamId: true,
          homeTeam: { select: { id: true, shortName: true } },
          awayTeam: { select: { id: true, shortName: true } },
          homePair: { select: { id: true, playerA: { select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true } }, playerB: { select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true } } } },
          awayPair: { select: { id: true, playerA: { select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true } }, playerB: { select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true } } } },
        },
        orderBy: { gameNumber: "asc" },
      },
    },
  });
  if (!matchup) notFound();

  const initial = {
    id: matchup.id,
    status: matchup.status,
    homeWins: matchup.homeWins,
    awayWins: matchup.awayWins,
    winnerTeamId: matchup.winnerTeamId,
    gamesPerMatchup: matchup.gamesPerMatchup,
    homeTeamId: matchup.homeTeamId,
    awayTeamId: matchup.awayTeamId,
    homeTeam: matchup.homeTeam ? { id: matchup.homeTeam.id, name: matchup.homeTeam.name, shortName: matchup.homeTeam.shortName } : null,
    awayTeam: matchup.awayTeam ? { id: matchup.awayTeam.id, name: matchup.awayTeam.name, shortName: matchup.awayTeam.shortName } : null,
    games: matchup.games.map((game) => ({
      id: game.id,
      gameNumber: game.gameNumber,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      status: game.status,
      winnerTeamId: game.winnerTeamId,
      homeTeam: { id: game.homeTeam.id, shortName: game.homeTeam.shortName },
      awayTeam: { id: game.awayTeam.id, shortName: game.awayTeam.shortName },
      homePair: { id: game.homePair.id, playerA: game.homePair.playerA, playerB: game.homePair.playerB },
      awayPair: { id: game.awayPair.id, playerA: game.awayPair.playerA, playerB: game.awayPair.playerB },
    })),
  };

  return <main className="mx-auto max-w-6xl px-4 py-5 md:py-8">
    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={matchup.status}/><span className="label">{matchup.division.name} · {matchup.groupLabel || matchup.stage} · {matchup.roundLabel} · Court {matchup.courtLabel || "TBA"}</span></div>
    <h1 className="mt-2 text-3xl font-black uppercase md:text-4xl">{matchup.homeTeam?.name || "TBD"} vs {matchup.awayTeam?.name || "TBD"}</h1>
    <p className="mt-2 hidden text-sm text-gray-500 md:block">Scores update in place while this page is open. No full-page refresh during live play.</p>
    <LiveMatchBoard initial={initial}/>
  </main>;
}
