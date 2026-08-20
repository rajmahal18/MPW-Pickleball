import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LiveMatchBoard from "@/components/LiveMatchBoard";
import StatusBadge from "@/components/StatusBadge";
import { TeamIdentity } from "@/components/TeamIdentity";
import { publicDivisionFilter } from "@/lib/public-preview";

export const dynamic = "force-dynamic";

export default async function MatchupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const divisionFilter = await publicDivisionFilter();
  const matchup = await prisma.matchup.findFirst({
    where: { id, division: divisionFilter, tournament: { isPublished: true } },
    include: {
      division: true,
      homeTeam: true,
      awayTeam: true,
      games: {
        select: {
          id: true, gameNumber: true, homeScore: true, awayScore: true, status: true, winnerTeamId: true,
          homeTeam: true,
          awayTeam: true,
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
    stage: matchup.stage,
    suddenDeathAtTen: matchup.division.suddenDeathAtTen,
    homeTeamId: matchup.homeTeamId,
    awayTeamId: matchup.awayTeamId,
    homeTeam: matchup.homeTeam,
    awayTeam: matchup.awayTeam,
    games: matchup.games.map((game) => ({
      id: game.id,
      gameNumber: game.gameNumber,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      status: game.status,
      winnerTeamId: game.winnerTeamId,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homePair: { id: game.homePair.id, playerA: game.homePair.playerA, playerB: game.homePair.playerB },
      awayPair: { id: game.awayPair.id, playerA: game.awayPair.playerA, playerB: game.awayPair.playerB },
    })),
  };

  const scope = matchup.groupLabel || matchup.stage.replaceAll("_", " ");
  const context = matchup.roundLabel.toLowerCase().includes(scope.toLowerCase()) ? matchup.roundLabel : `${scope} · ${matchup.roundLabel}`;

  return <main className="public-page mx-auto max-w-6xl px-4 py-5 md:py-8">
    <section className="public-hero"><div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={matchup.status}/><span className="public-kicker">{matchup.division.name} · {context} · Court {matchup.courtLabel || "TBA"}</span></div><h1 className="mt-3 flex flex-wrap items-center gap-3 text-2xl font-black tracking-tight md:text-4xl">{matchup.homeTeam ? <TeamIdentity team={matchup.homeTeam}/> : <span>TBD</span>} <span className="text-gray-300">vs</span> {matchup.awayTeam ? <TeamIdentity team={matchup.awayTeam}/> : <span>TBD</span>}</h1></div></section>
    <LiveMatchBoard initial={initial}/>
  </main>;
}
