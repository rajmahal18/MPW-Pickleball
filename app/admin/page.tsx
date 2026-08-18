import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import PlayerAvatar from "@/components/PlayerAvatar";
import SubmitButton from "@/components/SubmitButton";
import { formatPlayerDisplayName } from "@/lib/player-name";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

function scorecardsReady(matchup: {
  homeTeamId: string | null;
  awayTeamId: string | null;
  gamesPerMatchup: number;
  games: Array<{ gameNumber: number; homePairId: string; awayPairId: string }>;
  lineups: Array<{ teamId: string; slots: Array<{ slot: number; pairId: string }> }>;
}) {
  if (!matchup.homeTeamId || !matchup.awayTeamId || matchup.games.length !== matchup.gamesPerMatchup) return false;
  const home = matchup.lineups.find((lineup) => lineup.teamId === matchup.homeTeamId);
  const away = matchup.lineups.find((lineup) => lineup.teamId === matchup.awayTeamId);
  if (!home || !away || home.slots.length !== matchup.gamesPerMatchup || away.slots.length !== matchup.gamesPerMatchup) return false;
  const homeBySlot = new Map(home.slots.map((slot) => [slot.slot, slot.pairId]));
  const awayBySlot = new Map(away.slots.map((slot) => [slot.slot, slot.pairId]));
  return matchup.games.every((game) => homeBySlot.get(game.gameNumber) === game.homePairId && awayBySlot.get(game.gameNumber) === game.awayPairId);
}

function matchupContext(matchup: { groupLabel: string | null; stage: string; roundLabel: string }) {
  const scope = matchup.groupLabel || matchup.stage.replaceAll("_", " ");
  const round = matchup.roundLabel.trim();
  if (!round || round.toLowerCase() === scope.toLowerCase()) return scope;
  if (matchup.groupLabel && round.toLowerCase().includes(matchup.groupLabel.toLowerCase())) return round;
  return `${scope} · ${round}`;
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "SUPERADMIN" && user.role !== "ADMIN")) redirect("/login");
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, season: true, simulationMode: true, isPublished: true } });
  if (!tournament) return <main className="admin-shell">No tournament.</main>;

  const [matchups, matchupStatusGroups, liveGames, completedPairGames, pendingLineups, completedMatchups, votes, suspicious, voteGroups, revision] = await Promise.all([
    prisma.matchup.findMany({
      where: { tournamentId: tournament.id, status: { in: ["LIVE", "READY", "LINEUP_PENDING", "SCHEDULED", "COMPLETED", "FORFEITED"] }, homeTeamId: { not: null }, awayTeamId: { not: null } },
      select: {
        id: true, status: true, stage: true, groupLabel: true, roundLabel: true, courtLabel: true, queuePosition: true, gamesPerMatchup: true, homeWins: true, awayWins: true, homeTeamId: true, awayTeamId: true,
        division: { select: { name: true } },
        homeTeam: { select: { shortName: true } },
        awayTeam: { select: { shortName: true } },
        games: { select: { id: true, gameNumber: true, status: true, homeScore: true, awayScore: true, homePairId: true, awayPairId: true }, orderBy: { gameNumber: "asc" } },
        lineups: { select: { teamId: true, slots: { select: { slot: true, pairId: true } } } },
      },
      orderBy: [{ queuePosition: { sort: "asc", nulls: "last" } }, { order: "asc" }],
    }),
    prisma.matchup.groupBy({ by: ["status"], where: { tournamentId: tournament.id, homeTeamId: { not: null }, awayTeamId: { not: null } }, _count: { _all: true } }),
    prisma.game.count({ where: { matchup: { tournamentId: tournament.id }, status: "LIVE" } }),
    prisma.game.count({ where: { matchup: { tournamentId: tournament.id }, status: "COMPLETED" } }),
    prisma.matchup.count({ where: { tournamentId: tournament.id, status: "LINEUP_PENDING", homeTeamId: { not: null }, awayTeamId: { not: null } } }),
    prisma.matchup.count({ where: { tournamentId: tournament.id, status: "COMPLETED", homeTeamId: { not: null }, awayTeamId: { not: null } } }),
    prisma.fanVote.count({ where: { tournamentId: tournament.id } }),
    prisma.voteAttempt.count({ where: { tournamentId: tournament.id, success: false } }),
    prisma.fanVote.groupBy({
      by: ["playerId", "sexCategory"],
      where: { tournamentId: tournament.id },
      _count: { _all: true },
      orderBy: [{ sexCategory: "asc" }, { _count: { playerId: "desc" } }, { playerId: "asc" }],
    }),
    tournament.isPublished ? getPublicTournamentRevision(tournament.id) : Promise.resolve("none:0"),
  ]);
  const rankedPlayers = await prisma.player.findMany({
    where: { id: { in: voteGroups.map((row) => row.playerId) } },
    select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true, team: { select: { shortName: true, name: true } } },
  });
  const playerById = new Map(rankedPlayers.map((player) => [player.id, player]));
  const maleRankings = voteGroups.filter((row) => row.sexCategory === "MALE").slice(0, 5);
  const femaleRankings = voteGroups.filter((row) => row.sexCategory === "FEMALE").slice(0, 5);
  const statusCount = (status: string) => matchupStatusGroups.find((row) => row.status === status)?._count._all ?? 0;
  const liveMatchups = statusCount("LIVE");
  const readyMatchups = statusCount("READY");
  const terminalStatuses = new Set(["COMPLETED", "FORFEITED"]);
  const remainingSequence = new Map<string, number>();
  const byCourt = new Map<string, typeof matchups>();
  for (const matchup of matchups) {
    if (terminalStatuses.has(matchup.status) || matchup.queuePosition === null || !matchup.courtLabel) continue;
    const rows = byCourt.get(matchup.courtLabel) || [];
    rows.push(matchup);
    byCourt.set(matchup.courtLabel, rows);
  }
  for (const rows of byCourt.values()) {
    rows.sort((a, b) => {
      const activeDiff = (a.status === "LIVE" ? 0 : 1) - (b.status === "LIVE" ? 0 : 1);
      return activeDiff || (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER);
    });
    rows.forEach((matchup, index) => remainingSequence.set(matchup.id, index + 1));
  }
  const courtOrder = (label: string | null) => {
    if (!label) return Number.MAX_SAFE_INTEGER;
    const numeric = Number(label);
    return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER - 1;
  };
  const operationalMatchups = [...matchups].sort((first, second) => {
    const firstTerminal = terminalStatuses.has(first.status);
    const secondTerminal = terminalStatuses.has(second.status);
    if (firstTerminal !== secondTerminal) return firstTerminal ? 1 : -1;

    if (!firstTerminal) {
      const waveDiff = (remainingSequence.get(first.id) ?? Number.MAX_SAFE_INTEGER) - (remainingSequence.get(second.id) ?? Number.MAX_SAFE_INTEGER);
      if (waveDiff) return waveDiff;
      const courtDiff = courtOrder(first.courtLabel) - courtOrder(second.courtLabel);
      if (courtDiff) return courtDiff;
      const courtLabelDiff = (first.courtLabel || "").localeCompare(second.courtLabel || "");
      if (courtLabelDiff) return courtLabelDiff;
    }

    return (first.queuePosition ?? Number.MAX_SAFE_INTEGER) - (second.queuePosition ?? Number.MAX_SAFE_INTEGER);
  });

  return <main className="admin-shell">
    {tournament.isPublished && <TournamentSync initialRevision={revision} />}
    <AdminNav role={user.role}/>
    <FlashMessage {...query} />
    {tournament.simulationMode && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-950"><span>Testing mode is currently ON. Official live scoring should not begin until the Superadmin turns it off.</span>{user.role === "SUPERADMIN" && <form action="/api/admin/settings" method="post"><input type="hidden" name="action" value="disable-simulation"/><SubmitButton className="btn-ghost px-3 py-2 text-xs" pendingLabel="Turning off…">Turn off testing mode</SubmitButton></form>}</div>}
    <div>
      <div className="label">Tournament control room</div><h1 className="text-3xl font-black uppercase md:text-4xl">Admin Dashboard</h1><p className="mt-1 text-sm text-gray-500">{tournament.name} - {tournament.season}</p>
    </div>
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"><Stat label="Ongoing matchups" value={liveMatchups} tone={liveMatchups ? "live" : "neutral"}/><Stat label="Live pair matches" value={liveGames} tone={liveGames ? "live" : "neutral"}/><Stat label="Pending lineups" value={pendingLineups} tone={pendingLineups ? "warn" : "neutral"}/><Stat label="Ready to play" value={readyMatchups} tone={readyMatchups ? "good" : "neutral"}/><Stat label="Completed pair matches" value={completedPairGames} tone="neutral"/><Stat label="Completed matchups" value={completedMatchups} tone="neutral"/></div>
    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500"><span className="border border-line bg-white px-3 py-2"><strong className="text-ink">{votes}</strong> Fan Favorite votes</span><span className="border border-line bg-white px-3 py-2"><strong className="text-ink">{suspicious}</strong> rejected vote attempts</span></div>
    <div className={`mt-6 grid gap-3 md:gap-4 ${user.role === "SUPERADMIN" ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2"}`}><Quick href="#live-scoring" title="Live Scoring" text="Open active matches and encode points without page reloads."/>{user.role === "SUPERADMIN" && <><Quick href="/admin/tournament" title="Tournament Setup" text="Divisions, teams, lineup rules, court queue, and matchups."/><Quick href="/admin/players" title="Player Pool" text="Attendance, team assignment, and division eligibility."/><Quick href="/admin/voting" title="Voting" text="Fan Favorite voting codes and controls."/></>}</div>
    <section id="live-scoring" className="panel mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div>
          <div className="label text-court">Operate</div>
          <h2 className="text-xl font-black uppercase">Live scoring & match controls</h2>
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">Ordered by court wave: each court’s next unfinished matchup first, then the second matchup on each court, and so on. Completed matchups stay below active work.</p>
          <div className="mt-2 hidden flex-wrap gap-2 sm:flex"><StatusBadge status="LIVE" compact/><StatusBadge status="READY" compact/><StatusBadge status="LINEUP_PENDING" compact/><StatusBadge status="SCHEDULED" compact/><StatusBadge status="COMPLETED" compact/><StatusBadge status="FORFEITED" compact/></div>
        </div>
        {user.role === "SUPERADMIN" && <form action="/api/admin/generate-knockout" method="post"><SubmitButton className="btn-ghost px-3 py-2 text-xs" pendingLabel="Recalculating…">Recalculate bracket</SubmitButton></form>}
      </div>

      <div className="divide-y divide-line md:hidden">
        {operationalMatchups.map((matchup) => <article key={matchup.id} className={`p-4 ${matchup.status === "LIVE" ? "bg-flame/5" : matchup.status === "LINEUP_PENDING" ? "bg-amber-50/35" : matchup.status === "READY" ? "bg-emerald-50/25" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="font-black">{matchup.homeTeam?.shortName || "TBD"} vs {matchup.awayTeam?.shortName || "TBD"}</div><div className="mt-1 text-[11px] font-bold text-gray-500">{matchupContext(matchup)} · Court {matchup.courtLabel || "TBA"}</div></div>
            <StatusBadge status={matchup.status} compact/>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3"><span className="label">Series</span><strong className="text-xl tabular-nums">{matchup.homeWins}-{matchup.awayWins}</strong></div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {matchup.games.map((game) => <Link className={`shrink-0 border px-2.5 py-2 text-xs font-black ${game.status === "LIVE" ? "border-flame bg-flame/10 text-flame" : game.status === "COMPLETED" || game.status === "FORFEITED" ? "border-court/30 bg-court/10 text-court" : game.status === "INTERRUPTED" ? "border-orange-300 bg-orange-50 text-orange-800" : "border-line bg-white text-gray-600"}`} href={`/admin/score/${game.id}`} key={game.id}>M{game.gameNumber} · <span className="tabular-nums">{game.homeScore}-{game.awayScore}</span></Link>)}
            {!matchup.games.length && <span className="border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">Waiting for lineups</span>}
          </div>
          {scorecardsReady(matchup) && <Link className="btn-ghost mt-3 w-full border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" href={`/admin/matches/${matchup.id}/scorecards`}>Print scorecards</Link>}
        </article>)}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm"><thead className="bg-ink text-left text-white"><tr><th className="p-3">Matchup</th><th className="p-3">Court</th><th className="p-3">Status</th><th className="p-3">Series</th><th className="p-3">Matches</th><th className="p-3">Paper</th></tr></thead><tbody>{operationalMatchups.map((matchup) => <tr className={`border-b border-line ${matchup.status === "LIVE" ? "bg-flame/5" : matchup.status === "LINEUP_PENDING" ? "bg-amber-50/35" : matchup.status === "READY" ? "bg-emerald-50/25" : ""}`} key={matchup.id}><td className="p-3 font-bold">{matchup.homeTeam?.shortName || "TBD"} vs {matchup.awayTeam?.shortName || "TBD"}<div className="text-xs font-normal text-gray-500">{matchup.division.name} · {matchupContext(matchup)}</div></td><td className="p-3 font-bold">{matchup.courtLabel || "TBA"}</td><td className="p-3"><StatusBadge status={matchup.status} compact/></td><td className="p-3"><div className="inline-flex border border-line bg-white px-3 py-2 font-black tabular-nums">{matchup.homeWins}-{matchup.awayWins}</div></td><td className="p-3"><div className="flex min-w-64 flex-wrap gap-2">{matchup.games.map((game) => <Link className={`inline-flex items-center gap-1.5 border px-2 py-1 text-xs font-black ${game.status === "LIVE" ? "border-flame bg-flame/10 text-flame" : game.status === "COMPLETED" || game.status === "FORFEITED" ? "border-court/30 bg-court/10 text-court" : game.status === "INTERRUPTED" ? "border-orange-300 bg-orange-50 text-orange-800" : "border-line bg-white text-gray-600"}`} href={`/admin/score/${game.id}`} key={game.id}><span>M{game.gameNumber}</span><span className="tabular-nums">{game.homeScore}-{game.awayScore}</span><span className="text-[9px] uppercase opacity-70">{game.status === "LIVE" ? "live" : game.status === "COMPLETED" ? "done" : game.status === "FORFEITED" ? "forfeit" : game.status === "INTERRUPTED" ? "paused" : "pending"}</span></Link>)}{!matchup.games.length && <span className="border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">Waiting for both lineups</span>}</div></td><td className="p-3">{scorecardsReady(matchup) ? <Link className="btn-ghost whitespace-nowrap border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" href={`/admin/matches/${matchup.id}/scorecards`}>✓ Scorecards ready</Link> : <span className="text-xs font-bold text-gray-400">Not ready</span>}</td></tr>)}</tbody></table>
      </div>
      {!matchups.length && <div className="p-8 text-center text-sm text-gray-500">No assigned matchups are available. Use Tournament Setup for future structure.</div>}
    </section>
    <section className="mt-6 grid gap-4 lg:grid-cols-2"><FanStandings title="Male Fan Favorite" tone="male" rows={maleRankings} playerById={playerById}/><FanStandings title="Female Fan Favorite" tone="female" rows={femaleRankings} playerById={playerById}/></section>
  </main>;
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "live" | "warn" | "good" | "neutral" }) { const style = tone === "live" ? "border-flame/40 bg-flame/10" : tone === "warn" ? "border-amber-300 bg-amber-50" : tone === "good" ? "border-emerald-300 bg-emerald-50" : ""; return <div className={`panel p-4 ${style}`}><div className="text-3xl font-black tabular-nums">{value}</div><div className="label">{label}</div></div>; }
function Quick({ href, title, text }: { href: string; title: string; text: string }) { return <Link href={href} className="panel p-5 hover:border-court"><h2 className="font-black uppercase">{title}</h2><p className="mt-2 hidden text-sm text-gray-500 md:block">{text}</p></Link>; }
function FanStandings({ title, tone, rows, playerById }: { title: string; tone: "male" | "female"; rows: Array<{ playerId: string; _count: { _all: number } }>; playerById: Map<string, { firstName: string; middleInitial: string | null; lastName: string; displayName: string | null; avatarUrl: string | null; team: { shortName: string; name: string } | null }> }) {
  const header = tone === "male" ? "bg-court text-white" : "bg-gold text-ink";
  return <section className="panel overflow-hidden"><div className={`${header} flex items-end justify-between p-4`}><div><div className="text-xs font-black uppercase opacity-70">Current standings</div><h2 className="text-xl font-black uppercase">{title}</h2></div><Link href="/fan-favorite" className="btn border-white/40 px-3 py-2 text-xs">Open page</Link></div><div className="divide-y divide-line">{rows.length ? rows.map((row, index) => { const player = playerById.get(row.playerId); return player ? <div key={row.playerId} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 p-4"><div className={`grid h-8 w-8 place-items-center font-black ${index === 0 ? "bg-lime text-ink" : "bg-gray-100 text-gray-700"}`}>{index + 1}</div><div className="flex min-w-0 items-center gap-3"><PlayerAvatar {...player} size="sm"/><div className="min-w-0"><div className="truncate font-black">{formatPlayerDisplayName(player)}</div><div className="text-xs text-gray-500">{player.team?.shortName || "Unassigned"}</div></div></div><div className="text-right font-black">{row._count._all}</div></div> : null; }) : <div className="p-8 text-center text-gray-500">No valid votes yet.</div>}</div></section>;
}
