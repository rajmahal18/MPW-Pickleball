import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import PlayerAvatar from "@/components/PlayerAvatar";

export const dynamic = "force-dynamic";
export default async function Admin({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tournament) return <main className="p-8">No tournament.</main>;

  const [matchups, liveGames, pendingLineups, votes, suspicious, voteGroups] = await Promise.all([
    prisma.matchup.findMany({
      where: { tournamentId: tournament.id },
      include: { homeTeam: true, awayTeam: true, games: { orderBy: { gameNumber: "asc" } } },
      orderBy: [{ stage: "asc" }, { order: "asc" }],
    }),
    prisma.game.count({ where: { matchup: { tournamentId: tournament.id }, status: "LIVE" } }),
    prisma.matchup.count({ where: { tournamentId: tournament.id, status: "LINEUP_PENDING" } }),
    prisma.fanVote.count({ where: { tournamentId: tournament.id } }),
    prisma.voteAttempt.count({ where: { tournamentId: tournament.id, success: false } }),
    prisma.fanVote.groupBy({
      by: ["playerId", "sexCategory"],
      where: { tournamentId: tournament.id },
      _count: { _all: true },
      orderBy: [{ sexCategory: "asc" }, { _count: { playerId: "desc" } }, { playerId: "asc" }],
    }),
  ]);
  const rankedPlayers = await prisma.player.findMany({
    where: { id: { in: voteGroups.map((row) => row.playerId) } },
    include: { team: true },
  });
  const playerById = new Map(rankedPlayers.map((player) => [player.id, player]));
  const maleRankings = voteGroups.filter((row) => row.sexCategory === "MALE").slice(0, 5);
  const femaleRankings = voteGroups.filter((row) => row.sexCategory === "FEMALE").slice(0, 5);

  return <main className="mx-auto max-w-7xl px-4 py-8">
    <AdminNav />
    <FlashMessage {...query} />
    {tournament.simulationMode && <div className="mb-5 border-2 border-amber-400 bg-amber-50 p-4 font-black text-amber-950">SIMULATION MODE - TEST DATA MAY BE MODIFIED OR RESET</div>}
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="label">Tournament control room</div><h1 className="text-4xl font-black uppercase">Admin Dashboard</h1><p className="mt-1 text-sm text-gray-500">{tournament.name} - {tournament.season}</p></div>
      <form action="/api/auth/logout" method="post"><button className="btn-ghost">Logout</button></form>
    </div>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Live games" value={liveGames}/><Stat label="Pending lineups" value={pendingLineups}/><Stat label="Completed matchups" value={matchups.filter((m) => m.status === "COMPLETED").length}/><Stat label="Fan votes" value={votes}/><Stat label="Rejected votes" value={suspicious}/></div>
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Quick href="/admin/simulation" title="Simulation Center" text="Seeded game, matchup, stage, and voting scenarios."/><Quick href="/admin/voting" title="Voting Codes" text="Generate, print, issue, revoke, and replace one-time codes."/><Quick href="/admin/checkpoints" title="Checkpoints" text="Create and restore controlled recovery snapshots."/><Quick href="/mvp" title="MVP Tracker" text="Review male and female statistical rankings."/></div>
    <section className="mt-6 grid gap-4 lg:grid-cols-2"><FanStandings title="Male Fan Favorite" tone="male" rows={maleRankings} playerById={playerById}/><FanStandings title="Female Fan Favorite" tone="female" rows={femaleRankings} playerById={playerById}/></section>
    <section className="panel mt-6 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black uppercase">Tournament settings</h2><p className="text-sm text-gray-500">Destructive tools remain restricted separately from Simulation Mode.</p></div><div className="flex flex-wrap gap-2"><form action="/api/admin/generate-knockout" method="post"><button className="btn-primary">Recalculate bracket</button></form><form action="/api/admin/settings" method="post"><input type="hidden" name="action" value={tournament.simulationMode ? "disable-simulation" : "enable-simulation"}/><button className="btn-ghost">{tournament.simulationMode ? "Disable simulation" : "Enable simulation"}</button></form>{process.env.NODE_ENV !== "production" && <form action="/api/admin/settings" method="post"><input type="hidden" name="action" value={tournament.destructiveToolsEnabled ? "disable-destructive" : "enable-destructive"}/><button className="btn-ghost">{tournament.destructiveToolsEnabled ? "Restrict destructive tools" : "Allow destructive tools"}</button></form>}</div></div></section>
    <section className="panel mt-6 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-ink text-left text-white"><tr><th className="p-3">Team matchup</th><th className="p-3">Court</th><th className="p-3">Status</th><th className="p-3">Series</th><th className="p-3">Games</th></tr></thead><tbody>{matchups.map((matchup) => <tr className="border-b border-line" key={matchup.id}><td className="p-3 font-bold">{matchup.homeTeam?.shortName || "TBD"} vs {matchup.awayTeam?.shortName || "TBD"}<div className="text-xs font-normal text-gray-500">{matchup.groupLabel || matchup.stage} - {matchup.roundLabel}</div></td><td className="p-3">{matchup.courtLabel || "TBA"}</td><td className="p-3">{matchup.status.replaceAll("_", " ")}</td><td className="p-3 font-black">{matchup.homeWins}-{matchup.awayWins}</td><td className="p-3"><div className="flex min-w-64 flex-wrap gap-2">{matchup.games.map((game) => <Link className={`btn-ghost px-2 py-1 text-xs ${game.status === "LIVE" ? "border-red-500 text-red-700" : ""}`} href={`/admin/score/${game.id}`} key={game.id}>G{game.gameNumber} {game.homeScore}-{game.awayScore}</Link>)}{!matchup.games.length && <span className="text-xs text-gray-400">Waiting for both lineups</span>}</div></td></tr>)}</tbody></table></section>
  </main>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="panel p-4"><div className="text-3xl font-black">{value}</div><div className="label">{label}</div></div>; }
function Quick({ href, title, text }: { href: string; title: string; text: string }) { return <Link href={href} className="panel p-5 hover:border-court"><h2 className="font-black uppercase">{title}</h2><p className="mt-2 text-sm text-gray-500">{text}</p></Link>; }
function FanStandings({ title, tone, rows, playerById }: { title: string; tone: "male" | "female"; rows: Array<{ playerId: string; _count: { _all: number } }>; playerById: Map<string, { firstName: string; lastName: string; displayName: string | null; avatarUrl: string | null; team: { shortName: string; name: string } }> }) {
  const header = tone === "male" ? "bg-court text-white" : "bg-gold text-ink";
  return <section className="panel overflow-hidden"><div className={`${header} flex items-end justify-between p-4`}><div><div className="text-xs font-black uppercase opacity-70">Current standings</div><h2 className="text-xl font-black uppercase">{title}</h2></div><Link href="/fan-favorite" className="btn border-white/40 px-3 py-2 text-xs">Open page</Link></div><div className="divide-y divide-line">{rows.length ? rows.map((row, index) => { const player = playerById.get(row.playerId); return player ? <div key={row.playerId} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 p-4"><div className={`grid h-8 w-8 place-items-center font-black ${index === 0 ? "bg-lime text-ink" : "bg-gray-100 text-gray-700"}`}>{index + 1}</div><div className="flex min-w-0 items-center gap-3"><PlayerAvatar {...player} size="sm"/><div className="min-w-0"><div className="truncate font-black">{player.displayName || `${player.firstName} ${player.lastName}`}</div><div className="text-xs text-gray-500">{player.team.shortName}</div></div></div><div className="text-right font-black">{row._count._all}</div></div> : null; }) : <div className="p-8 text-center text-gray-500">No valid votes yet.</div>}</div></section>;
}
