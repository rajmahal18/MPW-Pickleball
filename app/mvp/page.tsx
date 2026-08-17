import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateMvpRankings } from "@/lib/tournament/mvp";
import PlayerAvatar from "@/components/PlayerAvatar";
import GenderIndicator from "@/components/GenderIndicator";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import { formatPlayerDisplayName } from "@/lib/player-name";
import MythicalPairPoster from "@/components/MythicalPairPoster";

export const dynamic = "force-dynamic";

export default async function MvpPage() {
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  const [games, matchups] = tournament ? await Promise.all([
    prisma.game.findMany({
      where: { matchup: { tournamentId: tournament.id, division: { isPublic: true } }, status: { in: ["COMPLETED", "FORFEITED"] } },
      include: {
        matchup: { select: { stage: true } },
        homePair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
        awayPair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
      },
    }),
    prisma.matchup.findMany({
      where: { tournamentId: tournament.id, division: { isPublic: true }, homeTeamId: { not: null }, awayTeamId: { not: null } },
      select: { stage: true, homeTeamId: true, awayTeamId: true, winnerTeamId: true, status: true },
    }),
  ]) : [[], []];
  const revision = tournament ? await getPublicTournamentRevision(tournament.id) : "none:0";
  const rankings = calculateMvpRankings(games, matchups);

  return <main className="public-page mx-auto max-w-7xl px-4 py-5 md:py-8">
    <TournamentSync initialRevision={revision}/>
    <div className="label">Stage-weighted statistical support</div>
    <h1 className="text-3xl font-black uppercase md:text-5xl">MVP Tracker</h1>
    <p className="mt-2 hidden max-w-4xl text-gray-600 md:block">Actual participation and wins earn more as the tournament gets deeper. Playoff selection matters, playoff wins matter more, and the Grand Final carries the highest individual weight.</p>

    {(rankings.male[0] || rankings.female[0]) && <div className="mt-6"><MythicalPairPoster male={rankings.male[0]} female={rankings.female[0]}/></div>}

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Leaderboard title="Male MVP" rows={rankings.male}/>
      <Leaderboard title="Female MVP" rows={rankings.female}/>
    </div>

    <details className="panel mt-6 p-4 md:hidden">
      <summary className="cursor-pointer font-black uppercase">How MVP points work</summary>
      <FormulaText/>
    </details>
    <section className="panel mt-6 hidden p-5 md:block">
      <h2 className="text-xl font-black uppercase">Transparent stage weighting</h2>
      <FormulaText/>
    </section>
  </main>;
}

function FormulaText() {
  return <div className="mt-3 space-y-2 text-sm text-gray-600">
    <p>A completed group/round-robin win earns <strong>1 point</strong>. A QF appearance + win is worth <strong>2 points</strong>, SF <strong>3</strong>, Battle for 3rd <strong>3.5</strong>, and Grand Final <strong>5</strong>. Playoff appearances still earn a smaller participation value even without a win.</p>
    <p>Reaching QF/SF/Battle for 3rd/GF adds only a small team-run bonus, with the GF weighted highest. Winning the championship adds a small extra bonus. Individual appearances and wins remain the main source of MVP points.</p>
    <p>Ties favor higher-stage wins first, then total wins, matches played, and point differential.</p>
  </div>;
}

function Leaderboard({ title, rows }: { title: string; rows: ReturnType<typeof calculateMvpRankings>["male"] }) {
  return <section className="panel overflow-hidden">
    <div className="bg-ink p-4 text-white"><div className="label text-lime">Live stage-weighted ranking</div><h2 className="text-2xl font-black uppercase">{title}</h2></div>
    <div className="divide-y divide-line">{rows.length ? rows.slice(0, 20).map((row) => <details key={row.player.id} className="group">
      <summary className={`grid cursor-pointer grid-cols-[34px_auto_minmax(0,1fr)_auto] items-center gap-3 p-3 sm:p-4 ${row.rank <= 3 ? "bg-court/5" : ""}`}>
        <span className="text-xl font-black">{row.rank}</span>
        <Link href={`/players/${row.player.id}`} aria-label={`View ${formatPlayerDisplayName(row.player)}`}><PlayerAvatar {...row.player} size={row.rank <= 3 ? "lg" : "md"}/></Link>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5"><Link href={`/players/${row.player.id}`} className="truncate text-sm font-black hover:text-court sm:text-base">{formatPlayerDisplayName(row.player)}</Link><GenderIndicator sex={row.player.sex} className="text-base"/></span>
          <span className="mt-1 block truncate text-[10px] text-gray-500 sm:text-xs">{row.player.team ? <Link href={`/teams/${row.player.team.id}`} className="hover:text-court hover:underline">{row.player.team.shortName}</Link> : "Historical pair"} · {row.wins}-{row.losses} · {row.gamesPlayed} matches</span>
        </span>
        <span className="shrink-0 text-right"><strong className="text-lg text-court sm:text-xl">{row.mvpIndex}</strong><span className="label hidden sm:block">MVP pts</span></span>
      </summary>
      <div className="grid gap-3 bg-gray-50 p-4 text-sm sm:grid-cols-3">
        <Metric label="Stage points" value={String(row.stagePoints)}/>
        <Metric label="Playoff wins" value={`${row.playoffWins} / ${row.playoffAppearances}`}/>
        <Metric label="Team-run bonus" value={String(row.teamStageBonus + row.championBonus)}/>
        <Metric label="Win rate" value={`${row.winPercentage}%`}/>
        <Metric label="Avg diff" value={row.averagePointDifferential > 0 ? `+${row.averagePointDifferential}` : String(row.averagePointDifferential)}/>
        <Metric label="Highest-stage win" value={row.highestStageWin ? stageName(row.highestStageWin) : "—"}/>
        <div className="sm:col-span-3 flex flex-wrap gap-1.5">{(["GROUP", "QUARTERFINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL"] as const).map((stage) => {
          const item = row.stageBreakdown[stage];
          if (!item.played) return null;
          return <span key={stage} className="border border-line bg-white px-2 py-1 text-[11px] font-bold">{stageName(stage)}: {item.wins}/{item.played} · {Math.round(item.points * 100) / 100} pts</span>;
        })}</div>
        {row.lockedPairDerived && <p className="sm:col-span-3 border-l-4 border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">Pair-result limitation: both partners share the same match result input. The ranking supports, but does not replace, the judges' eye test.</p>}
      </div>
    </details>) : <div className="p-10 text-center text-gray-500">Complete matches to populate this ranking.</div>}</div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="label">{label}</div><div className="font-black">{value}</div></div>;
}

function stageName(stage: string) {
  if (stage === "QUARTERFINAL") return "QF";
  if (stage === "SEMIFINAL") return "SF";
  if (stage === "THIRD_PLACE") return "3rd Place";
  if (stage === "FINAL") return "GF";
  if (stage === "ROUND_ROBIN") return "Round Robin";
  if (stage === "GROUP") return "Group";
  return stage.replaceAll("_", " ");
}
