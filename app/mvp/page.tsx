import { prisma } from "@/lib/prisma";
import { calculateMvpRankings } from "@/lib/tournament/mvp";
import PlayerAvatar from "@/components/PlayerAvatar";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import { formatPlayerDisplayName } from "@/lib/player-name";

export const dynamic = "force-dynamic";
export default async function MvpPage() {
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  const games = tournament ? await prisma.game.findMany({
    where: { matchup: { tournamentId: tournament.id, division: { isPublic: true } }, status: { in: ["COMPLETED", "FORFEITED"] } },
    include: {
      homePair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
      awayPair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
    },
  }) : [];
  const revision = tournament ? await getPublicTournamentRevision(tournament.id) : "none:0";
  const rankings = calculateMvpRankings(games);
  return <main className="mx-auto max-w-7xl px-4 py-8"><TournamentSync initialRevision={revision}/><div className="label">Objective statistical support</div><h1 className="text-4xl font-black uppercase md:text-5xl">MVP Tracker</h1><p className="mt-2 max-w-4xl text-gray-600">Separate male and female rankings derived from encoded results. The index supports judges using actual completed-game participation and results; matchup pairings may change between rounds.</p><div className="mt-6 grid gap-6 xl:grid-cols-2"><Leaderboard title="Male MVP" rows={rankings.male}/><Leaderboard title="Female MVP" rows={rankings.female}/></div><section className="panel mt-6 p-5"><h2 className="text-xl font-black uppercase">Transparent formula</h2><p className="mt-2 text-sm text-gray-600">Win rate {rankings.weights.winRate}%, average point differential {rankings.weights.pointDifferential}%, strength of schedule {rankings.weights.strengthOfSchedule}%, quality wins {rankings.weights.qualityWins}%, and consistency {rankings.weights.consistency}%. A confidence multiplier limits small-sample overranking until four games are played.</p></section></main>;
}

function Leaderboard({ title, rows }: { title: string; rows: ReturnType<typeof calculateMvpRankings>["male"] }) {
  return <section className="panel overflow-hidden"><div className="bg-ink p-4 text-white"><div className="label text-lime">Live statistical ranking</div><h2 className="text-2xl font-black uppercase">{title}</h2></div><div className="divide-y divide-line">{rows.length ? rows.slice(0, 20).map((row) => <details key={row.player.id} className="group"><summary className="grid cursor-pointer grid-cols-[34px_1fr_auto] items-center gap-3 p-4"><span className="text-xl font-black">{row.rank}</span><span className="flex items-center gap-3"><PlayerAvatar {...row.player} size="sm"/><span><strong className="block">{formatPlayerDisplayName(row.player)}</strong><span className="text-xs text-gray-500">{row.player.team?.shortName || "Historical pair"} - {row.wins}-{row.losses} - {row.gamesPlayed} GP</span></span></span><span className="text-right"><strong className="text-xl text-court">{row.mvpIndex}</strong><span className="label block">MVP index</span></span></summary><div className="grid gap-3 bg-gray-50 p-4 text-sm sm:grid-cols-3"><Metric label="Win rate" value={`${row.winPercentage}%`} score={row.components.winRate}/><Metric label="Avg diff" value={row.averagePointDifferential > 0 ? `+${row.averagePointDifferential}` : String(row.averagePointDifferential)} score={row.components.pointDifferential}/><Metric label="Schedule" value={`${row.strengthOfSchedule}%`} score={row.components.strengthOfSchedule}/><Metric label="Quality wins" value={String(row.qualityWins)} score={row.components.qualityWins}/><Metric label="Consistency" value={`${row.consistency}%`} score={row.components.consistency}/><Metric label="Confidence" value={`${row.confidence}%`} score={0}/>{row.lockedPairDerived && <p className="sm:col-span-3 border-l-4 border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">Locked-pair limitation: this statistical output is derived from pair results. Judges still use the eye test to distinguish partners.</p>}</div></details>) : <div className="p-10 text-center text-gray-500">Complete games to populate this ranking.</div>}</div></section>;
}
function Metric({ label, value, score }: { label: string; value: string; score: number }) { return <div><div className="label">{label}</div><div className="font-black">{value}</div>{score > 0 && <div className="text-xs text-gray-500">{score} index pts</div>}</div>; }
