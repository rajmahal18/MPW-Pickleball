import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FlashMessage from "@/components/FlashMessage";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import StatusBadge from "@/components/StatusBadge";
import { nextEditableTeamMatchupId } from "@/lib/tournament/leader-lineup-access";
import SubmitButton from "@/components/SubmitButton";
import { KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";

function matchupContext(matchup: { groupLabel: string | null; stage: string; roundLabel: string }) {
  const scope = matchup.groupLabel || matchup.stage.replaceAll("_", " ");
  const round = matchup.roundLabel.trim();
  if (!round || round.toLowerCase() === scope.toLowerCase()) return scope;
  if (matchup.groupLabel && round.toLowerCase().includes(matchup.groupLabel.toLowerCase())) return round;
  return `${scope} · ${round}`;
}

export default async function Leader({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; passwordSuccess?: string; passwordError?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEAM_MANAGER" || !user.teamId) redirect("/login");
  const query = await searchParams;
  const matchups = await prisma.matchup.findMany({
    where: { OR: [{ homeTeamId: user.teamId }, { awayTeamId: user.teamId }] },
    include: { division: true, homeTeam: true, awayTeam: true, lineups: { include: { slots: true } }, games: { orderBy: { gameNumber: "asc" } } },
    orderBy: [{ queuePosition: { sort: "asc", nulls: "last" } }, { order: "asc" }],
  });
  const revision = matchups[0] ? await getPublicTournamentRevision(matchups[0].tournamentId) : "none:0";
  const active = matchups.filter((matchup) => matchup.status !== "COMPLETED" && matchup.status !== "FORFEITED");
  const history = matchups.filter((matchup) => matchup.status === "COMPLETED" || matchup.status === "FORFEITED");
  const nextEditableId = nextEditableTeamMatchupId(active);
  const nextMatchup = active.find((matchup) => matchup.id === nextEditableId) ?? null;
  const laterMatchups = active.filter((matchup) => matchup.id !== nextEditableId);

  const ownLineupComplete = (matchup: (typeof matchups)[number]) => {
    const lineup = matchup.lineups.find((item) => item.teamId === user.teamId);
    return Boolean(lineup && lineup.slots.length === matchup.gamesPerMatchup);
  };
  const needsLineup = nextMatchup && !ownLineupComplete(nextMatchup) ? 1 : 0;
  const ongoing = active.filter((matchup) => matchup.status === "LIVE").length;
  const ready = active.filter((matchup) => matchup.status === "READY").length;

  const card = (matchup: (typeof matchups)[number], access: "OPEN" | "LOCKED" = "OPEN") => {
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
    const locked = access === "LOCKED" && !decided;
    const managerStatus = locked
      ? { status: "SCHEDULED", label: matchup.queuePosition === null ? "Not scheduled yet" : "Locked · later matchup" }
      : decided
        ? { status: matchup.status, label: matchup.status === "FORFEITED" ? "Forfeited" : "Completed" }
        : matchup.status === "LIVE"
          ? { status: "LIVE", label: "Ongoing" }
          : !submitted
            ? { status: "LINEUP_PENDING", label: hasSavedDraft ? "Complete your lineup" : "Needs your lineup" }
            : bothSubmitted
              ? { status: "READY", label: "Ready to play" }
              : { status: "LINEUP_PENDING", label: "Waiting for opponent" };

    return <div className={`panel flex flex-wrap items-center justify-between gap-3 p-4 ${locked ? "bg-gray-50/70" : ""}`} key={matchup.id}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={managerStatus.status} label={managerStatus.label} compact/><span className="label">{matchup.division.name} · {matchupContext(matchup)}</span></div>
        <div className="mt-2 text-base font-black sm:text-lg">{matchup.homeTeam?.name || "TBD"} vs {matchup.awayTeam?.name || "TBD"}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {matchup.queuePosition !== null && <span className="border border-court/20 bg-court/5 px-2 py-1 font-black text-court">Queue #{matchup.queuePosition}{matchup.courtLabel ? ` · Court ${matchup.courtLabel}` : ""}</span>}
          <span className="border border-line bg-white px-2 py-1 font-black">Series {matchup.homeWins}-{matchup.awayWins}</span>
          <span className="hidden border border-line bg-white px-2 py-1 font-bold sm:inline">{matchup.gamesPerMatchup} pair match{matchup.gamesPerMatchup === 1 ? "" : "es"}</span>
          {!locked && protectedGames > 0 && !fullyProtected && !decided ? <span className="border border-line bg-gray-50 px-2 py-1 font-bold text-gray-600">{protectedGames} played · future matches editable</span> : null}
          {!locked && bothSubmitted && !decided ? <span className="border border-emerald-300 bg-emerald-50 px-2 py-1 font-bold text-emerald-800">Both lineups complete</span> : !locked && submitted && !decided ? <span className="border border-amber-300 bg-amber-50 px-2 py-1 font-bold text-amber-950">Your lineup is complete</span> : !locked && hasSavedDraft && !decided ? <span className="border border-amber-300 bg-amber-50 px-2 py-1 font-bold text-amber-950">Saved draft is incomplete</span> : null}
        </div>
      </div>
      {locked
        ? <div className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold text-gray-500 sm:w-auto">{matchup.queuePosition === null ? "Waiting for the facilitator to place this in the court schedule." : "Opens after your earlier matchup is completed."}</div>
        : decided || fullyProtected
          ? <span className="bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600">{decided ? "No lineup action needed" : "All matches started · lineup fixed"}</span>
          : <Link className={`${!submitted ? "btn-primary" : "btn-ghost"} w-full justify-center sm:w-auto`} href={`/leader/matchups/${matchup.id}`}>{!submitted ? hasSavedDraft ? "Finish lineup" : "Set lineup" : protectedGames ? "Edit future matches" : "Review lineup"}</Link>}
    </div>;
  };

  return <main className="mx-auto max-w-5xl px-4 py-4 md:py-8">
    <TournamentSync initialRevision={revision} />
    <FlashMessage {...query}/>
    <div>
      <div className="label">Team manager portal</div><h1 className="text-2xl font-black uppercase sm:text-3xl md:text-4xl">{user.team?.name}</h1><p className="mt-1 hidden max-w-3xl text-sm text-gray-500 md:block">Only your next unfinished matchup in the court schedule is open for lineup work. Later matchups unlock automatically after the earlier one is completed.</p>
    </div>

    <section className="mt-4 md:mt-6">
      <div className="mb-2 md:mb-3"><div className="label text-court">Next in court schedule</div><h2 className="text-lg font-black uppercase md:text-xl">Lineup access</h2></div>
      {nextMatchup
        ? card(nextMatchup, "OPEN")
        : <div className="panel p-5 text-sm font-bold text-gray-500 md:p-6">No lineup is open yet. Your facilitator needs to place your next unfinished matchup in the court schedule.</div>}
    </section>

    <div className="mt-5 hidden grid-cols-2 gap-3 md:grid lg:grid-cols-4">
      <PortalStat label="Needs your lineup" value={needsLineup} tone={needsLineup ? "warn" : "neutral"}/><PortalStat label="Ongoing" value={ongoing} tone={ongoing ? "live" : "neutral"}/><PortalStat label="Ready to play" value={ready} tone={ready ? "good" : "neutral"}/><PortalStat label="Completed" value={history.length} tone="neutral"/>
    </div>

    {laterMatchups.length > 0 && <section className="mt-6">
      <div className="mb-3 flex items-end justify-between gap-3"><div><div className="label">Later</div><h2 className="text-lg font-black uppercase md:text-xl">Upcoming matchups</h2></div><span className="text-xs font-bold text-gray-500">{laterMatchups.length} locked</span></div>
      <div className="space-y-3">{laterMatchups.map((matchup) => card(matchup, "LOCKED"))}</div>
    </section>}

    {history.length > 0 && <details className="mt-6 border border-line bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-black uppercase text-gray-600">Completed matchups ({history.length})</summary>
      <div className="space-y-3 border-t border-line bg-paper p-3">{history.map((matchup) => card(matchup, "OPEN"))}</div>
    </details>}

    <section id="account-security" className="mt-6 scroll-mt-24 border-t border-line pt-5">
      <details className="bg-white" open={Boolean(query.passwordSuccess || query.passwordError)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border border-line px-4 py-3 marker:content-none">
          <span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center bg-court/10 text-court"><KeyRound size={18}/></span><span><span className="block text-sm font-black uppercase">Account security</span><span className="block text-xs font-medium text-gray-500">Change your captain account password</span></span></span>
          <span className="text-xs font-black uppercase text-court">Manage</span>
        </summary>
        <form action="/api/leader/password" method="post" className="grid gap-4 border-x border-b border-line p-4 sm:grid-cols-2 md:p-5">
          {(query.passwordSuccess || query.passwordError) && <div className="sm:col-span-2"><FlashMessage success={query.passwordSuccess} error={query.passwordError}/></div>}
          <label className="block sm:col-span-2"><span className="label">Current password</span><input name="currentPassword" type="password" required autoComplete="current-password" className="mt-1 w-full border border-line p-3"/></label>
          <label className="block"><span className="label">New password</span><input name="newPassword" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className="mt-1 w-full border border-line p-3"/><span className="mt-1 block text-xs text-gray-500">Use at least 8 characters.</span></label>
          <label className="block"><span className="label">Confirm new password</span><input name="confirmPassword" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className="mt-1 w-full border border-line p-3"/></label>
          <div className="sm:col-span-2 sm:flex sm:justify-end"><SubmitButton className="btn-primary w-full justify-center sm:w-auto" pendingLabel="Changing password…">Change password</SubmitButton></div>
        </form>
      </details>
    </section>
  </main>;
}

function PortalStat({ label, value, tone }: { label: string; value: number; tone: "warn" | "live" | "good" | "neutral" }) {
  const style = tone === "warn" ? "border-amber-300 bg-amber-50" : tone === "live" ? "border-flame/40 bg-flame/10" : tone === "good" ? "border-emerald-300 bg-emerald-50" : "border-line bg-white";
  return <div className={`border p-4 ${style}`}><div className="text-3xl font-black tabular-nums">{value}</div><div className="label">{label}</div></div>;
}
