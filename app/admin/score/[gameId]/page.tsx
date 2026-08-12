import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FlashMessage from "@/components/FlashMessage";
import AdminNav from "@/components/AdminNav";
import SubmitButton from "@/components/SubmitButton";
import AdminScoreConsole from "@/components/AdminScoreConsole";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const scorePlayerSelect = {
  id: true,
  firstName: true,
  middleInitial: true,
  lastName: true,
  displayName: true,
  avatarUrl: true,
} as const;

export default async function Score({ params, searchParams }: { params: Promise<{ gameId: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");
  const { gameId } = await params;
  const query = await searchParams;
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      homeTeam: { select: { id: true, name: true, shortName: true } },
      awayTeam: { select: { id: true, name: true, shortName: true } },
      homePair: { select: { id: true, label: true, playerA: { select: scorePlayerSelect }, playerB: { select: scorePlayerSelect } } },
      awayPair: { select: { id: true, label: true, playerA: { select: scorePlayerSelect }, playerB: { select: scorePlayerSelect } } },
      matchup: { include: {
        division: { select: { suddenDeathAtTen: true } },
        games: { select: { id: true, gameNumber: true, status: true, homeScore: true, awayScore: true }, orderBy: { gameNumber: "asc" } },
      } },
      scoreEvents: { orderBy: { createdAt: "desc" }, take: 10, include: { actor: true } },
    },
  });
  if (!game) notFound();

  const initial = {
    id: game.id,
    version: game.version,
    gameNumber: game.gameNumber,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    status: game.status,
    winnerTeamId: game.winnerTeamId,
    startedAt: game.startedAt?.toISOString() ?? null,
    completedAt: game.completedAt?.toISOString() ?? null,
    homeTeam: { id: game.homeTeam.id, name: game.homeTeam.name, shortName: game.homeTeam.shortName },
    awayTeam: { id: game.awayTeam.id, name: game.awayTeam.name, shortName: game.awayTeam.shortName },
    homePair: {
      id: game.homePair.id,
      label: game.homePair.label,
      playerA: game.homePair.playerA,
      playerB: game.homePair.playerB,
    },
    awayPair: {
      id: game.awayPair.id,
      label: game.awayPair.label,
      playerA: game.awayPair.playerA,
      playerB: game.awayPair.playerB,
    },
    matchup: {
      id: game.matchup.id,
      status: game.matchup.status,
      homeWins: game.matchup.homeWins,
      awayWins: game.matchup.awayWins,
      roundLabel: game.matchup.roundLabel,
      courtLabel: game.matchup.courtLabel,
      suddenDeathAtTen: game.matchup.division.suddenDeathAtTen,
    },
  };

  return <main className="admin-shell">
    <AdminNav/>
    <FlashMessage {...query}/>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={game.status}/><span className="label">Live scoring · {game.matchup.roundLabel} · Court {game.matchup.courtLabel || "TBA"}</span></div>
        <h1 className="mt-2 text-3xl font-black uppercase">Match {game.gameNumber}</h1>
        <p className="mt-1 hidden text-sm text-gray-500 md:block">Use the large +1 controls during play. Each point saves in place without navigating or refreshing the page.</p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto"><Link href="/admin#live-scoring" className="btn-ghost flex-1 justify-center sm:flex-none">Live board</Link><Link href={`/matches/${game.matchupId}`} className="btn-ghost flex-1 justify-center sm:flex-none">Public view</Link></div>
    </div>

    <section className="panel mt-5 overflow-hidden">
      <div className="border-b border-line bg-paper px-4 py-3"><div className="label">Matches in this team matchup</div><p className="mt-1 hidden text-xs text-gray-500 md:block">Jump directly between pair matches without returning to the dashboard.</p></div>
      <div className="flex gap-2 overflow-x-auto p-4">{game.matchup.games.map((item) => <Link key={item.id} href={`/admin/score/${item.id}`} aria-current={item.id === game.id ? "page" : undefined} className={`inline-flex items-center gap-2 border px-3 py-2 text-xs font-black ${item.id === game.id ? "border-court bg-court text-white" : item.status === "LIVE" ? "border-flame bg-flame/10 text-flame" : item.status === "COMPLETED" || item.status === "FORFEITED" ? "border-court/30 bg-court/10 text-court" : "border-line bg-white text-gray-600"}`}><span>M{item.gameNumber}</span><span className="tabular-nums">{item.homeScore}-{item.awayScore}</span><span className="text-[9px] uppercase opacity-70">{item.status === "LIVE" ? "Live" : item.status === "COMPLETED" ? "Done" : item.status === "FORFEITED" ? "Forfeit" : item.status === "INTERRUPTED" ? "Paused" : "Pending"}</span></Link>)}</div>
    </section>

    <AdminScoreConsole initial={initial}/>

    <section className="panel mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-black uppercase">Recovery</h2><p className="text-sm text-gray-500">Undo restores the state before the latest non-undone score event. This is intentionally separate from normal point controls.</p></div>
        <form action="/api/admin/undo" method="post"><input type="hidden" name="action" value="score-event"/><input type="hidden" name="gameId" value={game.id}/><SubmitButton className="btn border-red-600 bg-red-600 text-white" pendingLabel="Undoing…">Undo latest score change</SubmitButton></form>
      </div>
    </section>

    <section className="panel mt-6 overflow-hidden">
      <div className="border-b border-line p-4"><h2 className="text-xl font-black uppercase">Recent score events</h2><p className="mt-1 text-xs text-gray-500">This audit trail updates when the page is reopened; normal live scoring does not refresh the whole screen.</p></div>
      <div className="divide-y divide-line">{game.scoreEvents.length ? game.scoreEvents.map((event) => <details key={event.id} className="p-4"><summary className="cursor-pointer font-bold">{event.action} · {event.actor?.name || "System"} · {event.createdAt.toLocaleString()} {event.undoneAt && <span className="text-red-700">(undone)</span>}</summary><pre className="mt-2 overflow-auto bg-gray-50 p-3 text-xs">{JSON.stringify({ before: event.beforeState, after: event.afterState, reason: event.reason }, null, 2)}</pre></details>) : <div className="p-4 text-sm text-gray-500">No score events yet.</div>}</div>
    </section>
  </main>;
}
