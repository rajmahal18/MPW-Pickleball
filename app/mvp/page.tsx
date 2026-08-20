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
import { recognitionDivisionSlug } from "@/lib/tournament/recognition-division";
import { isMvpPublic } from "@/lib/tournament/mvp-visibility";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Query = { division?: string; success?: string; error?: string };
type AwardState = ReturnType<typeof resolveMvpAward>;

export default async function MvpPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  const [user, mvpVisible] = await Promise.all([
    getCurrentUser(),
    tournament ? isMvpPublic(tournament.id) : Promise.resolve(false),
  ]);
  if (!mvpVisible && user?.role !== "SUPERADMIN") notFound();
  const divisions = tournament ? await prisma.division.findMany({
    where: { tournamentId: tournament.id, isPublic: true, slug: recognitionDivisionSlug() },
    select: { id: true, name: true, slug: true, entrantType: true, sexCategory: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  }) : [];
  const selected = divisions.find((division) => division.slug === query.division || division.id === query.division) ?? divisions[0] ?? null;
  const [games, matchups, selections] = tournament && selected ? await Promise.all([
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
  ]) : [[], [], []];
  const revision = tournament ? await getPublicTournamentRevision(tournament.id) : "none:0";
  const rankings = calculateMvpRankings(games, matchups);
  const selectionBySex = new Map(selections.map((selection) => [selection.sexCategory, selection]));
  const maleState = resolveMvpAward(rankings.male, selectionBySex.get("MALE")?.playerId ?? null);
  const femaleState = resolveMvpAward(rankings.female, selectionBySex.get("FEMALE")?.playerId ?? null);

  return <main className="public-page mx-auto max-w-7xl px-4 py-5 md:py-8">
    <TournamentSync initialRevision={revision}/>
    <FlashMessage success={query.success} error={query.error}/>
    <section className="public-hero">
      <div><div className="public-kicker">Transparent performance index</div><h1 className="public-title">MVP Tracker</h1><p className="public-lede">A live performance race built from results, trust, playoff delivery, opponent quality and margins. The formula stays visible without turning every player row into a dashboard.</p></div>
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

      <FormulaDisclosure/>
    </>}
  </main>;
}

function FormulaDisclosure() {
  return <details className="panel group mt-6 overflow-hidden">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 md:p-5">
      <div><div className="public-kicker">Transparent by design</div><h2 className="text-xl font-black uppercase md:text-2xl">How the MVP Index works</h2><p className="mt-1 text-xs leading-5 text-gray-500">View the exact weights, component math, playoff leverage, eligibility and locked-pair rule.</p></div>
      <span className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-court group-open:bg-court group-open:text-white">View formula</span>
    </summary>
    <div className="grid gap-5 border-t border-line p-4 md:p-5 xl:grid-cols-2">
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-line text-[10px] font-black uppercase tracking-wider text-gray-500"><th className="pb-2">Factor</th><th className="pb-2">Weight</th><th className="pb-2">Component score (0–100)</th></tr></thead><tbody className="divide-y divide-line">
        <FormulaRow factor="Wins" weight={MVP_COMPONENT_WEIGHTS.wins * 100} formula="Wins ÷ most wins in the current category × 100"/>
        <FormulaRow factor="Win rate" weight={MVP_COMPONENT_WEIGHTS.winRate * 100} formula="Wins ÷ matches played × 100"/>
        <FormulaRow factor="Participation / trust" weight={MVP_COMPONENT_WEIGHTS.participation * 100} formula="Matches played ÷ most matches played in the category × 100"/>
        <FormulaRow factor="Playoff impact" weight={MVP_COMPONENT_WEIGHTS.playoffImpact * 100} formula="Actual playoff leverage ÷ highest current playoff leverage × 100"/>
        <FormulaRow factor="Strength of schedule" weight={MVP_COMPONENT_WEIGHTS.strengthOfSchedule * 100} formula="Combined record of all opponents faced against the rest of the field"/>
        <FormulaRow factor="Point differential" weight={MVP_COMPONENT_WEIGHTS.pointDifferential * 100} formula={`Average point diff mapped from -${MVP_POINT_DIFF_CAP}…+${MVP_POINT_DIFF_CAP}; 0 diff = 50`}/>
        <FormulaRow factor="Team finish" weight={MVP_COMPONENT_WEIGHTS.teamFinish * 100} formula="QF 35 · SF 55 · 3rd 65 · finalist 75 · champion 100"/>
      </tbody></table></div>
      <div className="space-y-3 text-sm leading-6 text-gray-600">
        <p><strong className="text-ink">MVP Index =</strong> 10% Wins + 20% Win Rate + 10% Participation + 20% Playoff Impact + 17.5% Strength of Schedule + 17.5% Point Differential + 5% Team Finish.</p>
        <p><strong className="text-ink">Strength of schedule:</strong> every opponent faced counts, whether the player won or lost. For each opponent, matches against the player being evaluated are removed first; the remaining opponent wins/losses are then pooled. Opponents with more independent results naturally carry more evidence.</p>
        <p><strong className="text-ink">Playoff leverage:</strong> QF appearance +1 and win +1; SF +2/+2; Battle for 3rd +2/+2; Grand Final +3/+3. Credit is earned only when the player actually plays that match.</p>
        <p><strong className="text-ink">Eligibility:</strong> at least {MVP_MIN_MATCHES} completed matches for the formal award. Until anyone qualifies, the same ranking remains visible as provisional.</p>
        <p><strong className="text-ink">Locked-pair tie:</strong> if the statistical leaders played every recorded match together and share the exact top record and Index, no fake decimal tiebreaker is invented. Once formally eligible, organizers choose the individual awardee.</p>
        <p className="border-l-4 border-court bg-court/5 px-3 py-2 text-xs text-court">Team finish is intentionally only 5%. A non-champion can still win MVP on stronger individual tournament performance.</p>
      </div>
    </div>
  </details>;
}

function Leaderboard({ title, rows, state, divisionId, sex, isSuperadmin }: { title: string; rows: MvpRow[]; state: AwardState; divisionId: string; sex: "MALE" | "FEMALE"; isSuperadmin: boolean }) {
  const hasEligible = rows.some((row) => row.eligible);
  const tiedIds = new Set(state.tie.map((row) => row.player.id));
  const standardRows = state.tie.length === 2 ? rows.filter((row) => !tiedIds.has(row.player.id)) : rows;

  return <section className="panel overflow-hidden">
    <div className="bg-ink p-4 text-white"><div className="label text-lime">{hasEligible ? "Formal MVP ranking" : "Provisional MVP ranking"}</div><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-2xl font-black uppercase">{title}</h2>{state.selectedByOrganizers && <span className="rounded-full border border-lime/50 bg-lime/10 px-2.5 py-1 text-[10px] font-black uppercase text-lime">Selected by organizers</span>}</div></div>

    {state.tie.length === 2 && <LockedPairTie state={state} divisionId={divisionId} sex={sex} isSuperadmin={isSuperadmin}/>} 

    <div className="divide-y divide-line">{rows.length ? standardRows.slice(0, 20).map((row) => <CandidateRow key={row.player.id} row={row} awarded={state.winner?.player.id === row.player.id} selectedByOrganizers={state.selectedByOrganizers}/>) : <div className="p-10 text-center text-gray-500">Complete matches to populate this ranking.</div>}</div>
  </section>;
}

function LockedPairTie({ state, divisionId, sex, isSuperadmin }: { state: AwardState; divisionId: string; sex: "MALE" | "FEMALE"; isSuperadmin: boolean }) {
  const [first, second] = state.tie;
  if (!first || !second) return null;
  const formallyEligible = first.eligible && second.eligible;
  const selected = state.winner;

  return <div className="border-b border-line bg-court/5 p-4 md:p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 -space-x-3"><PlayerAvatar {...first.player} size="lg"/><PlayerAvatar {...second.player} size="lg"/></div>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-lg font-black">#1 Locked-pair tie</span><EligibilityBadge row={first}/></div><div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-ink"><Link href={`/players/${first.player.id}`} className="hover:text-court">{formatPlayerDisplayName(first.player)}</Link><span className="font-semibold text-gray-300">+</span><Link href={`/players/${second.player.id}`} className="hover:text-court">{formatPlayerDisplayName(second.player)}</Link></div></div>
      </div>
      <div className="shrink-0 sm:text-right"><div className="text-3xl font-black text-court">{formatNumber(first.mvpIndex)}</div><div className="label">Shared MVP Index</div></div>
    </div>

    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-gray-600">
      <span><strong className="text-ink">{first.wins}-{first.losses}</strong> record</span>
      <span><strong className="text-ink">{first.gamesPlayed}</strong> matches</span>
      <span><strong className="text-ink">{first.playoffWins}-{first.playoffAppearances - first.playoffWins}</strong> playoffs</span>
      <span>SOS <strong className="text-ink">{formatNumber(first.strengthOfSchedule)}%</strong></span>
      <span>Avg diff <strong className="text-ink">{signed(first.averagePointDifferential)}</strong></span>
      <span><strong className="text-ink">{first.teamFinishLabel}</strong></span>
    </div>

    <details className="mt-4 border-t border-court/15 pt-3"><summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-court">View shared Index breakdown</summary><div className="mt-3"><FactorBreakdown row={first}/><StageContext row={first}/></div></details>

    {formallyEligible ? <div className="mt-4 border-t border-court/15 pt-4">
      {selected && <div className="mb-3 text-sm font-bold text-court"><strong>{formatPlayerDisplayName(selected.player)}</strong> is the awarded MVP · Selected by organizers</div>}
      {!selected && <div className="mb-3 text-sm font-semibold text-amber-900">Their recorded tournament performance is statistically identical. Organizer judgment decides the individual award recipient.</div>}
      {isSuperadmin && <form action="/api/admin/mvp-selection" method="post" className="space-y-3">
        <input type="hidden" name="divisionId" value={divisionId}/><input type="hidden" name="sexCategory" value={sex}/><input type="hidden" name="action" value="select"/>
        <fieldset><legend className="label text-court">Organizer selection · Superadmin</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{state.tie.map((row) => <label key={row.player.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-white p-3 hover:border-court/40"><input type="radio" name="playerId" value={row.player.id} defaultChecked={selected?.player.id === row.player.id} required className="h-4 w-4 accent-current"/><PlayerAvatar {...row.player} size="md"/><span className="min-w-0 font-black">{formatPlayerDisplayName(row.player)}</span></label>)}</div></fieldset>
        <SubmitButton className="btn-primary rounded-md px-4 py-2 text-xs" pendingLabel="Saving...">{selected ? "Update MVP selection" : "Select MVP"}</SubmitButton>
      </form>}
    </div> : <div className="mt-4 border-t border-amber-200 pt-3 text-xs font-semibold text-amber-900">This is a provisional tie. Organizer selection becomes available only when both players reach the {MVP_MIN_MATCHES}-match eligibility threshold.</div>}
  </div>;
}

function CandidateRow({ row, awarded, selectedByOrganizers }: { row: MvpRow; awarded: boolean; selectedByOrganizers: boolean }) {
  return <details className="group">
    <summary className={`grid cursor-pointer list-none grid-cols-[34px_auto_minmax(0,1fr)_auto] items-center gap-3 p-3 sm:p-4 ${row.rank <= 3 ? "bg-court/5" : ""} ${awarded ? "ring-2 ring-inset ring-court/30" : ""}`}>
      <span className="text-xl font-black">{row.rank}</span>
      <Link href={`/players/${row.player.id}`} aria-label={`View ${formatPlayerDisplayName(row.player)}`}><PlayerAvatar {...row.player} size={row.rank <= 3 ? "lg" : "md"}/></Link>
      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5"><Link href={`/players/${row.player.id}`} className="truncate text-sm font-black hover:text-court sm:text-base">{formatPlayerDisplayName(row.player)}</Link><GenderIndicator sex={row.player.sex} className="text-base"/><EligibilityBadge row={row}/>{awarded && selectedByOrganizers && <span className="rounded-full border border-court/30 bg-court/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-court">Selected by organizers</span>}</span>
        <span className="mt-1 block truncate text-[10px] text-gray-500 sm:text-xs">{row.wins}-{row.losses} · {row.gamesPlayed} matches · {row.teamFinishLabel} · SOS {formatNumber(row.strengthOfSchedule)}% · Avg diff {signed(row.averagePointDifferential)}</span>
      </span>
      <span className="shrink-0 text-right"><strong className="text-lg text-court sm:text-xl">{formatNumber(row.mvpIndex)}</strong><span className="label hidden sm:block">MVP Index</span></span>
    </summary>
    <div className="border-t border-line bg-gray-50/70 p-4">
      <FactorBreakdown row={row}/>
      <StageContext row={row}/>
      {row.lockedPairDerived && <p className="mt-3 text-xs font-semibold text-amber-900">Locked-pair derived: this player has used the same partner throughout recorded matches.</p>}
    </div>
  </details>;
}

function EligibilityBadge({ row }: { row: MvpRow }) {
  return row.eligible
    ? <span className="rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-800">Eligible</span>
    : <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-900">Provisional · {row.matchesToEligibility} to qualify</span>;
}

function FactorBreakdown({ row }: { row: MvpRow }) {
  const factors = [
    ["Wins", row.components.wins, MVP_COMPONENT_WEIGHTS.wins, null],
    ["Win rate", row.components.winRate, MVP_COMPONENT_WEIGHTS.winRate, null],
    ["Participation / trust", row.components.participation, MVP_COMPONENT_WEIGHTS.participation, null],
    ["Playoff impact", row.components.playoffImpact, MVP_COMPONENT_WEIGHTS.playoffImpact, null],
    ["Strength of schedule", row.components.strengthOfSchedule, MVP_COMPONENT_WEIGHTS.strengthOfSchedule, `${row.strengthOfScheduleWins}-${row.strengthOfScheduleLosses} pooled opponent record vs rest of field`],
    ["Point differential", row.components.pointDifferential, MVP_COMPONENT_WEIGHTS.pointDifferential, null],
    ["Team finish", row.components.teamFinish, MVP_COMPONENT_WEIGHTS.teamFinish, null],
  ] as const;

  return <div>
    <div className="mb-2 flex items-center justify-between"><span className="label">Index breakdown</span><span className="text-xs font-bold text-gray-400">score × weight = contribution</span></div>
    <div className="divide-y divide-line border-y border-line">{factors.map(([label, score, weight, detail]) => <div key={label} className="grid grid-cols-[minmax(110px,1fr)_68px_54px] items-center gap-3 py-2 text-xs sm:grid-cols-[minmax(140px,1fr)_minmax(90px,.7fr)_58px_62px]">
      <div className="min-w-0"><div><strong className="text-ink">{label}</strong><span className="ml-1.5 text-[10px] font-bold text-gray-400">{formatNumber(weight * 100)}%</span></div>{detail && <div className="mt-0.5 text-[10px] font-semibold leading-4 text-gray-400">{detail}</div>}</div>
      <div className="hidden h-1.5 overflow-hidden rounded-full bg-gray-200 sm:block"><div className="h-full rounded-full bg-court" style={{ width: `${Math.max(0, Math.min(100, score))}%` }}/></div>
      <div className="text-right font-bold text-gray-600">{formatNumber(score)}</div>
      <div className="text-right font-black text-court">+{formatNumber(score * weight)}</div>
    </div>)}</div>
    <div className="mt-2 flex items-baseline justify-end gap-2"><span className="label">MVP Index</span><strong className="text-2xl text-court">{formatNumber(row.mvpIndex)}</strong><span className="text-xs font-bold text-gray-400">/ 100</span></div>
  </div>;
}

function StageContext({ row }: { row: MvpRow }) {
  const stages = (["GROUP", "ROUND_ROBIN", "QUARTERFINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL"] as const)
    .map((stage) => ({ stage, ...row.stageBreakdown[stage] }))
    .filter((item) => item.played > 0);
  return <div className="mt-4 border-t border-line pt-3">
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-gray-500"><span>Playoffs <strong className="text-ink">{row.playoffWins}-{row.playoffAppearances - row.playoffWins}</strong></span><span>Leverage <strong className="text-ink">{formatNumber(row.playoffLeverage)}</strong></span><span>Finish <strong className="text-ink">{row.teamFinishLabel}</strong></span></div>
    {stages.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{stages.map((item) => <span key={item.stage} className="rounded-full border border-line bg-white px-2 py-1 text-[10px] font-bold text-gray-600">{stageName(item.stage)} · {item.wins}/{item.played}{item.leverage > 0 ? ` · L${formatNumber(item.leverage)}` : ""}</span>)}</div>}
  </div>;
}

function FormulaRow({ factor, weight, formula }: { factor: string; weight: number; formula: string }) { return <tr><td className="py-2.5 font-black text-ink">{factor}</td><td className="py-2.5 font-black text-court">{formatNumber(weight)}%</td><td className="py-2.5 text-gray-600">{formula}</td></tr>; }
function formatNumber(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, ""); }
function signed(value: number) { const formatted = formatNumber(value); return value > 0 ? `+${formatted}` : formatted; }
function stageName(stage: string) { if (stage === "QUARTERFINAL") return "QF"; if (stage === "SEMIFINAL") return "SF"; if (stage === "THIRD_PLACE") return "3rd Place"; if (stage === "FINAL") return "GF"; if (stage === "ROUND_ROBIN") return "Round Robin"; if (stage === "GROUP") return "Group"; return stage.replaceAll("_", " "); }
