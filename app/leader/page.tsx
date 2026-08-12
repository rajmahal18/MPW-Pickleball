import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FlashMessage from "@/components/FlashMessage";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function Leader({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEAM_LEADER" || !user.teamId) redirect("/login");
  const query = await searchParams;
  const matchups = await prisma.matchup.findMany({
    where: { OR: [{ homeTeamId: user.teamId }, { awayTeamId: user.teamId }] },
    include: { division: true, homeTeam: true, awayTeam: true, lineups: { include: { slots: true } }, games: { orderBy: { gameNumber: "asc" } } },
    orderBy: [{ scheduledAt: "asc" }, { order: "asc" }],
  });
  const revision = matchups[0] ? await getPublicTournamentRevision(matchups[0].tournamentId) : "none:0";
  const active = matchups.filter((matchup) => matchup.status !== "COMPLETED" && matchup.status !== "FORFEITED");
  const history = matchups.filter((matchup) => matchup.status === "COMPLETED" || matchup.status === "FORFEITED");
  const ownLineupComplete = (matchup: (typeof matchups)[number]) => {
    const lineup = matchup.lineups.find((item) => item.teamId === user.teamId);
    return Boolean(lineup && lineup.slots.length === matchup.gamesPerMatchup);
  };
  const needsLineup = active.filter((matchup) => !ownLineupComplete(matchup)).length;
  const ongoing = active.filter((matchup) => matchup.status === "LIVE").length;
  const ready = active.filter((matchup) => matchup.status === "READY").length;

  const card = (matchup: (typeof matchups)[number]) => {
    const ownLineup = matchup.lineups.find((lineup) => lineup.teamId === user.teamId);
    const homeLineup = matchup.lineups.find((lineup) => lineup.teamId === matchup.homeTeamId);
    const awayLineup = matchup.lineups.find((lineup) => lineup.teamId === matchup.awayTeamId);
    const submitted = Boolean(ownLineup && ownLineup.slots.length === matchup.gamesPerMatchup);
    const hasSavedDraft = Boolean(ownLineup);
    const homeBySlot = new Map(homeLineup?.slots.map((slot) => [slot.slot, slot.pairId]) ?? []);
    const awayBySlot = new Map(awayLineup?.slots.map((slot) => [slot.slot, slot.pairId]) ?? []);
    const bothSubmitted = Boolean(homeLineup && awayLineup
      && homeLineup.slots.length === matchup.gamesPerMatchup
      && awayLineup.slots.length === matchup.gamesPerMatchup
      && matchup.games.length === matchup.gamesPerMatchup
      && matchup.games.every((game) => homeBySlot.get(game.gameNumber) === game.homePairId && awayBySlot.get(game.gameNumber) === game.awayPairId));
    const protectedGames = matchup.games.filter((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0).length;
    const fullyProtected = matchup.games.length === matchup.gamesPerMatchup && protectedGames === matchup.gamesPerMatchup;
    const decided = matchup.status === "COMPLETED" || matchup.status === "FORFEITED";
    const managerStatus = decided
      ? { status: matchup.status, label: matchup.status === "FORFEITED" ? "Forfeited" : "Completed" }
      : matchup.status === "LIVE"
        ? { status: "LIVE", label: "Ongoing" }
        : !submitted
          ? { status: "LINEUP_PENDING", label: hasSavedDraft ? "Complete your lineup" : "Needs your lineup" }
          : bothSubmitted
            ? { status: "READY", label: "Ready to play" }
            : { status: "LINEUP_PENDING", label: "Waiting for opponent" };
    const accent = managerStatus.status === "LIVE" ? "border-l-4 border-l-flame" : managerStatus.status === "LINEUP_PENDING" && !submitted ? "border-l-4 border-l-amber-400" : managerStatus.status === "READY" ? "border-l-4 border-l-emerald-500" : "";
    return <div className={`panel flex flex-wrap items-center justify-between gap-3 p-4 ${accent}`} key={matchup.id}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={managerStatus.status} label={managerStatus.label} compact/><span className="label">{matchup.division.name} · {matchup.groupLabel || matchup.stage} · {matchup.roundLabel}</span></div>
        <div className="mt-2 text-lg font-black">{matchup.homeTeam?.name || "TBD"} vs {matchup.awayTeam?.name || "TBD"}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span className="border border-court/20 bg-court/5 px-2 py-1 font-black text-court">Series {matchup.homeWins}-{matchup.awayWins}</span>
          <span className="border border-line bg-white px-2 py-1 font-bold">{matchup.gamesPerMatchup} pair game{matchup.gamesPerMatchup === 1 ? "" : "s"}</span>
          {protectedGames > 0 && !fullyProtected && !decided ? <span className="border border-line bg-gray-50 px-2 py-1 font-bold text-gray-600">{protectedGames} played · future games editable</span> : null}
          {bothSubmitted && !decided ? <span className="border border-emerald-300 bg-emerald-50 px-2 py-1 font-bold text-emerald-800">Both lineups complete · scorecards ready</span> : submitted && !decided ? <span className="border border-amber-300 bg-amber-50 px-2 py-1 font-bold text-amber-950">Your lineup is complete</span> : hasSavedDraft && !decided ? <span className="border border-amber-300 bg-amber-50 px-2 py-1 font-bold text-amber-950">Saved draft is incomplete</span> : null}
        </div>
      </div>
      {decided || fullyProtected
        ? <span className="bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600">{decided ? "No lineup action needed" : "All games started · lineup fixed"}</span>
        : <Link className={!submitted ? "btn-primary" : "btn-ghost"} href={`/leader/matchups/${matchup.id}`}>{!submitted ? hasSavedDraft ? "Finish lineup" : "Set lineup" : protectedGames ? "Edit future games" : "Review lineup"}</Link>}
    </div>;
  };

  return <main className="mx-auto max-w-5xl px-4 py-8">
    <TournamentSync initialRevision={revision} />
    <FlashMessage {...query}/>
    <div className="flex flex-wrap justify-between gap-3">
      <div><div className="label">Team leader portal</div><h1 className="text-4xl font-black uppercase">{user.team?.name}</h1><p className="mt-1 max-w-3xl text-sm text-gray-500">Submit the playing pairs for each matchup from your confirmed roster. Pairings may change from round to round; only a game that has already started is protected.</p></div>
      <form action="/api/auth/logout" method="post"><button type="submit" className="btn-ghost">Logout</button></form>
    </div>

    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <PortalStat label="Needs your lineup" value={needsLineup} tone={needsLineup ? "warn" : "neutral"}/><PortalStat label="Ongoing" value={ongoing} tone={ongoing ? "live" : "neutral"}/><PortalStat label="Ready to play" value={ready} tone={ready ? "good" : "neutral"}/><PortalStat label="Completed" value={history.length} tone="neutral"/>
    </div>

    <section className="mt-6">
      <div className="mb-3"><div className="label text-court">Action required / upcoming</div><h2 className="text-xl font-black uppercase">Matchups</h2><p className="mt-1 text-sm text-gray-500">Amber needs lineup work, green is ready, and red marks a matchup already in progress.</p></div>
      <div className="space-y-3">{active.length ? active.map(card) : <div className="panel p-8 text-center text-gray-500">No upcoming matchup needs lineup action right now.</div>}</div>
    </section>

    {history.length > 0 && <details className="mt-6 border border-line bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-black uppercase text-gray-600">Completed matchups ({history.length})</summary>
      <div className="space-y-3 border-t border-line bg-paper p-3">{history.map(card)}</div>
    </details>}
  </main>;
}

function PortalStat({ label, value, tone }: { label: string; value: number; tone: "warn" | "live" | "good" | "neutral" }) {
  const style = tone === "warn" ? "border-amber-300 bg-amber-50" : tone === "live" ? "border-flame/40 bg-flame/10" : tone === "good" ? "border-emerald-300 bg-emerald-50" : "border-line bg-white";
  return <div className={`border p-4 ${style}`}><div className="text-3xl font-black tabular-nums">{value}</div><div className="label">{label}</div></div>;
}
