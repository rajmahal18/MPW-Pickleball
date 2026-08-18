import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateMvpRankings, resolveMvpAward, type MvpRow } from "@/lib/tournament/mvp";
import PlayerAvatar from "@/components/PlayerAvatar";
import GenderIndicator from "@/components/GenderIndicator";
import TournamentSync from "@/components/TournamentSync";
import EventTabs from "@/components/EventTabs";
import FlashMessage from "@/components/FlashMessage";
import SubmitButton from "@/components/SubmitButton";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import { formatPlayerDisplayName } from "@/lib/player-name";
import MythicalPairPoster from "@/components/MythicalPairPoster";
import { getCurrentUser } from "@/lib/auth";
import { MVP_COMPONENT_WEIGHTS, MVP_MIN_MATCHES, MVP_POINT_DIFF_CAP } from "@/lib/tournament/config";

export const dynamic = "force-dynamic";

type Query = { division?: string; success?: string; error?: string };

export default async function MvpPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  const divisions = tournament ? await prisma.division.findMany({
    where: { tournamentId: tournament.id, isPublic: true },
    select: { id: true, name: true, slug: true, entrantType: true, sexCategory: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  }) : [];
  const selected = divisions.find((division) => division.slug === query.division || division.id === query.division) ?? divisions[0] ?? null;
  const [games, matchups, selections, user] = tournament && selected ? await Promise.all([
    prisma.game.findMany({
      where: { matchup: { tournamentId: tournament.id, divisionId: selected.id }, status: { in: ["COMPLETED", "FORFEITED"] } },
      include: {
        matchup: { select: { stage: true } },
        homePair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
        awayPair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
      },
    }),
    prisma.matchup.findMany({ where: { tournamentId: tournament.id, divisionId: selected.id }, select: { stage: true, homeTeamId: true, awayTeamId: true, winnerTeamId: true, status: true } }),
    prisma.mvpSelection.findMany({ where: { tournamentId: tournament.id, divisionId: selected.id }, select: { sexCategory: true, playerId: true, selectedAt: true } }),
    getCurrentUser(),
  ]) : [[], [], [], null];
  const revision = tournament ? await getPublicTournamentRevision(tournament.id) : "none:0";
  const rankings = calculateMvpRankings(games, matchups);
  const selectionBySex = new Map(selections.map((selection) => [selection.sexCategory, selection]));
  const maleState = resolveMvpAward(rankings.male, selectionBySex.get("MALE")?.playerId ?? null);
  const femaleState = resolveMvpAward(rankings.female, selectionBySex.get("FEMALE")?.playerId ?? null);

  return <main className="public-page mx-auto max-w-7xl px-4 py-5 md:py-8">
    <TournamentSync initialRevision={revision}/>
    <FlashMessage success={query.success} error={query.error}/>
    <section className="public-hero">
      <div><div className="public-kicker">Transparent performance index</div><h1 className="public-title">MVP Tracker</h1><p className="public-lede">Wins and win rate lead the race, but the index also rewards trusted participation, deep-playoff delivery, quality opponents, convincing margins, and a small team-finish factor.</p></div>
    </section>
    <EventTabs divisions={divisions} activeId={selected?.id ?? ""} basePath="/mvp"/>

    {!selected ? <div className="public-empty mt-6">No public event is configured.</div> : <>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-gray-600 md:mt-6">
        <span className="rounded-full border border-line bg-white px-3 py-1.5">{selected.name}</span>
        <span className="rounded-full border border-line bg-white px-3 py-1.5">Formal eligibility: {MVP_MIN_MATCHES}+ matches</span>
        {((selected.sexCategory !== "FEMALE" && !rankings.male.some((row) => row.eligible)) || (selected.sexCategory !== "MALE" && !rankings.female.some((row) => row.eligible))) && <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-900">Early rankings remain visible as provisional</span>}
      </div>

      {!selected.sexCategory && (maleState.winner || femaleState.winner) && <div className="mt-6"><MythicalPairPoster male={maleState.winner} female={femaleState.winner}/></div>}

      <div className={`mt-6 grid gap-6 ${selected.sexCategory ? "grid-cols-1" : "xl:grid-cols-2"}`}>
        {selected.sexCategory !== "FEMALE" && <Leaderboard title="Male MVP" rows={rankings.male} state={maleState} divisionId={selected.id} sex="MALE" isSuperadmin={user?.role === "SUPERADMIN"}/>}
        {selected.sexCategory !== "MALE" && <Leaderboard title="Female MVP" rows={rankings.female} state={femaleState} divisionId={selected.id} sex="FEMALE" isSuperadmin={user?.role === "SUPERADMIN"}/>}
      </div>

      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-line bg-gray-50/70 p-4 md:p-5"><div className="public-kicker">Visible in the app by design</div><h2 className="text-xl font-black uppercase md:text-2xl">How the MVP Index works</h2></div>
        <div className="grid gap-4 p-4 md:p-5 xl:grid-cols-2">
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-line text-[10px] font-black uppercase tracking-wider text-gray-500"><th className="pb-2">Factor</th><th className="pb-2">Weight</th><th className="pb-2">Component score (0–100)</th></tr></thead><tbody className="divide-y divide-line">
            <FormulaRow factor="Wins" weight={15} formula="Wins ÷ most wins in the current category × 100"/>
            <FormulaRow factor="Win rate" weight={20} formula="Wins ÷ matches played × 100"/>
            <FormulaRow factor="Participation / trust" weight={10} formula="Matches played ÷ most matches played in the category × 100"/>
            <FormulaRow factor="Playoff impact" weight={20} formula="Actual playoff leverage ÷ highest current playoff leverage × 100"/>
            <FormulaRow factor="Strength of schedule" weight={15} formula="Average win rate of the opponents beaten"/>
            <FormulaRow factor="Point differential" weight={15} formula={`Average point diff mapped from -${MVP_POINT_DIFF_CAP}…+${MVP_POINT_DIFF_CAP}; 0 diff = 50`}/>
            <FormulaRow factor="Team finish" weight={5} formula="QF 35 · SF 55 · 3rd 65 · finalist 75 · champion 100"/>
          </tbody></table></div>
          <div className="space-y-3 text-sm leading-6 text-gray-600">
            <p><strong className="text-ink">MVP Index =</strong> 15% Wins + 20% Win Rate + 10% Participation + 20% Playoff Impact + 15% Strength of Schedule + 15% Point Differential + 5% Team Finish.</p>
            <p><strong className="text-ink">Playoff leverage:</strong> QF appearance +1 and win +1; SF +2/+2; Battle for 3rd +2/+2; Grand Final +3/+3. A player gets playoff credit only when they actually play that match.</p>
            <p><strong className="text-ink">Eligibility:</strong> at least {MVP_MIN_MATCHES} completed matches for the formal award. Before anyone qualifies, the same calculation stays visible as a provisional MVP race.</p>
            <p><strong className="text-ink">Locked-pair tie:</strong> when the statistical leaders are the same locked pair with identical results and MVP Index, the system does not invent a decimal tiebreaker. Superadmin may choose one; the public result is marked <em>Selected by organizers</em>.</p>
            <p className="rounded-lg border border-court/20 bg-court/5 p-3 text-xs text-court">The team-finish component is intentionally only 5%. A player from a non-champion team can still win if their own record, playoff performance, opponent quality and margins are stronger.</p>
          </div>
        </div>
      </section>
    </>}
  </main>;
}

type AwardState = ReturnType<typeof resolveMvpAward>;

function Leaderboard({ title, rows, state, divisionId, sex, isSuperadmin }: { title: string; rows: MvpRow[]; state: AwardState; divisionId: string; sex: "MALE" | "FEMALE"; isSuperadmin: boolean }) {
  const hasEligible = rows.some((row) => row.eligible);
  return <section className="panel overflow-hidden">
    <div className="bg-ink p-4 text-white"><div className="label text-lime">{hasEligible ? "Formal MVP ranking" : "Provisional MVP ranking"}</div><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-2xl font-black uppercase">{title}</h2>{state.selectedByOrganizers && <span className="rounded-full border border-lime/50 bg-lime/10 px-2.5 py-1 text-[10px] font-black uppercase text-lime">Selected by organizers</span>}</div></div>
    {state.pendingOrganizerSelection && <div className="border-b border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">The current #1 is an exact locked-pair tie. Organizer selection is required before one player is declared the award recipient.</div>}
    {isSuperadmin && state.tie.length === 2 && state.tie.every((row) => row.eligible) && <form action="/api/admin/mvp-selection" method="post" className="grid gap-2 border-b border-court/20 bg-court/5 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <input type="hidden" name="divisionId" value={divisionId}/><input type="hidden" name="sexCategory" value={sex}/><input type="hidden" name="action" value="select"/>
      <label><span className="label text-court">Locked-pair tiebreak · Superadmin</span><select name="playerId" defaultValue={state.winner?.player.id ?? ""} required className="mt-1 w-full rounded-md border border-line bg-white p-2.5 text-sm font-bold"><option value="">Choose the MVP</option>{state.tie.map((row) => <option key={row.player.id} value={row.player.id}>{formatPlayerDisplayName(row.player)} · Index {row.mvpIndex}</option>)}</select></label>
      <SubmitButton className="btn-primary rounded-md px-3 py-2 text-xs" pendingLabel="Saving...">Select MVP</SubmitButton>
    </form>}
    <div className="divide-y divide-line">{rows.length ? rows.slice(0, 20).map((row) => {
      const awarded = state.winner?.player.id === row.player.id;
      return <details key={row.player.id} className="group">
        <summary className={`grid cursor-pointer grid-cols-[34px_auto_minmax(0,1fr)_auto] items-center gap-3 p-3 sm:p-4 ${row.rank <= 3 ? "bg-court/5" : ""} ${awarded ? "ring-2 ring-inset ring-court/30" : ""}`}>
          <span className="text-xl font-black">{row.rank}</span>
          <Link href={`/players/${row.player.id}`} aria-label={`View ${formatPlayerDisplayName(row.player)}`}><PlayerAvatar {...row.player} size={row.rank <= 3 ? "lg" : "md"}/></Link>
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5"><Link href={`/players/${row.player.id}`} className="truncate text-sm font-black hover:text-court sm:text-base">{formatPlayerDisplayName(row.player)}</Link><GenderIndicator sex={row.player.sex} className="text-base"/>{row.eligible ? <span className="rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-800">Eligible</span> : <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-900">Provisional · {row.matchesToEligibility} to qualify</span>}{awarded && state.selectedByOrganizers && <span className="rounded-full border border-court/30 bg-court/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-court">Selected by organizers</span>}</span>
            <span className="mt-1 block truncate text-[10px] text-gray-500 sm:text-xs">{row.wins}-{row.losses} · {row.gamesPlayed} matches · SOS {row.strengthOfSchedule}% · Avg diff {signed(row.averagePointDifferential)}</span>
          </span>
          <span className="shrink-0 text-right"><strong className="text-lg text-court sm:text-xl">{row.mvpIndex}</strong><span className="label hidden sm:block">MVP Index</span></span>
        </summary>
        <div className="bg-gray-50 p-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <ComponentMetric label="Wins · 15%" score={row.components.wins} contribution={row.components.wins * MVP_COMPONENT_WEIGHTS.wins}/>
            <ComponentMetric label="Win rate · 20%" score={row.components.winRate} contribution={row.components.winRate * MVP_COMPONENT_WEIGHTS.winRate}/>
            <ComponentMetric label="Participation · 10%" score={row.components.participation} contribution={row.components.participation * MVP_COMPONENT_WEIGHTS.participation}/>
            <ComponentMetric label="Playoff impact · 20%" score={row.components.playoffImpact} contribution={row.components.playoffImpact * MVP_COMPONENT_WEIGHTS.playoffImpact}/>
            <ComponentMetric label="Strength of schedule · 15%" score={row.components.strengthOfSchedule} contribution={row.components.strengthOfSchedule * MVP_COMPONENT_WEIGHTS.strengthOfSchedule}/>
            <ComponentMetric label="Point diff · 15%" score={row.components.pointDifferential} contribution={row.components.pointDifferential * MVP_COMPONENT_WEIGHTS.pointDifferential}/>
            <ComponentMetric label="Team finish · 5%" score={row.components.teamFinish} contribution={row.components.teamFinish * MVP_COMPONENT_WEIGHTS.teamFinish}/>
            <div className="rounded-lg border border-court/25 bg-white p-3"><div className="label text-court">Total</div><div className="text-xl font-black text-court">{row.mvpIndex} / 100</div></div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3"><Metric label="Playoff record" value={`${row.playoffWins}-${row.playoffAppearances - row.playoffWins}`}/><Metric label="Playoff leverage" value={String(row.playoffLeverage)}/><Metric label="Team finish" value={row.teamFinishLabel}/></div>
          <div className="mt-3 flex flex-wrap gap-1.5">{(["GROUP", "QUARTERFINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL"] as const).map((stage) => { const item = row.stageBreakdown[stage]; return item.played ? <span key={stage} className="border border-line bg-white px-2 py-1 text-[11px] font-bold">{stageName(stage)}: {item.wins}/{item.played} · leverage {item.leverage}</span> : null; })}</div>
          {row.lockedPairDerived && <p className="mt-3 border-l-4 border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">This player has used the same partner throughout recorded matches. If that partner shares the exact top Index and record, organizer selection—not an invented statistical tiebreaker—decides the award.</p>}
        </div>
      </details>;
    }) : <div className="p-10 text-center text-gray-500">Complete matches to populate this ranking.</div>}</div>
  </section>;
}

function FormulaRow({ factor, weight, formula }: { factor: string; weight: number; formula: string }) { return <tr><td className="py-2.5 font-black text-ink">{factor}</td><td className="py-2.5 font-black text-court">{weight}%</td><td className="py-2.5 text-gray-600">{formula}</td></tr>; }
function ComponentMetric({ label, score, contribution }: { label: string; score: number; contribution: number }) { return <div className="rounded-lg border border-line bg-white p-3"><div className="label">{label}</div><div className="font-black">{score}/100</div><div className="mt-0.5 text-[10px] text-gray-500">+{Math.round(contribution * 100) / 100} Index</div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><div className="label">{label}</div><div className="font-black">{value}</div></div>; }
function signed(value: number) { return value > 0 ? `+${value}` : String(value); }
function stageName(stage: string) { if (stage === "QUARTERFINAL") return "QF"; if (stage === "SEMIFINAL") return "SF"; if (stage === "THIRD_PLACE") return "3rd Place"; if (stage === "FINAL") return "GF"; if (stage === "ROUND_ROBIN") return "Round Robin"; if (stage === "GROUP") return "Group"; return stage.replaceAll("_", " "); }
