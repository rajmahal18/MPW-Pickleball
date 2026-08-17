"use client";

import { useEffect, useMemo, useState } from "react";
import type { VotingAdminSnapshot, VotingBatchSummary } from "@/lib/tournament/voting-dashboard";
import SubmitButton from "@/components/SubmitButton";

export default function FanFavoriteAdminLive({ initialSnapshot }: { initialSnapshot: VotingAdminSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    const schedule = () => {
      if (stopped) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(run, 3000 + Math.round(Math.random() * 700));
    };
    const run = async () => {
      if (stopped) return;
      if (document.visibilityState !== "visible") { schedule(); return; }
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/admin/voting-live", { cache: "no-store", signal: controller.signal });
        if (response.ok) setSnapshot(await response.json());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Keep the latest operational snapshot visible and retry on the next poll.
        }
      } finally {
        controller = null;
        schedule();
      }
    };
    schedule();
    const onFocus = () => void run();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      controller?.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const current = useMemo(() => snapshot.batches.find((batch) => batch.state === "ACTIVE") ?? snapshot.batches.find((batch) => batch.state === "SOLD_OUT") ?? null, [snapshot.batches]);
  const next = useMemo(() => [...snapshot.batches].filter((batch) => batch.state === "SCHEDULED").sort((a, b) => new Date(a.releaseAt).getTime() - new Date(b.releaseAt).getTime())[0] ?? null, [snapshot.batches]);

  return <div className="mt-5 space-y-5">
    <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <section className="panel overflow-hidden">
        <div className="border-b border-line p-4"><div className="label text-court">Live status</div><h2 className="text-xl font-black uppercase">Current code drop</h2></div>
        {current ? <BatchFocus batch={current}/> : <div className="p-5 text-sm font-semibold text-gray-500">No batch has been released yet.{next ? <> Next drop: <strong className="text-ink">{formatPhDate(next.releaseAt)}</strong>.</> : null}</div>}
        {next && <div className="border-t border-line bg-paper px-4 py-3 text-xs font-semibold text-gray-600"><strong className="text-ink">Next:</strong> {next.quantity} codes · {formatPhDate(next.releaseAt)}</div>}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-end justify-between gap-3 border-b border-line p-4"><div><div className="label text-court">Vote distribution</div><h2 className="text-xl font-black uppercase">Votes by team</h2></div><div className="text-right"><div className="text-2xl font-black tabular-nums">{snapshot.totalPlayerVotes}</div><div className="label">player votes</div></div></div>
        <div className="space-y-3 p-4">{snapshot.totalPlayerVotes > 0 ? snapshot.teamDistribution.map((team, index) => <div key={team.teamId}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs"><div className="min-w-0 truncate font-black"><span className="mr-2 text-gray-400">{index + 1}</span>{team.shortName}</div><div className="shrink-0 font-black tabular-nums">{team.votes} · {team.percentage}%</div></div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-court transition-[width] duration-500" style={{ width: `${Math.max(team.percentage, team.votes ? 2 : 0)}%` }}/></div>
        </div>) : <div className="py-6 text-center text-sm text-gray-500">No votes yet.</div>}</div>
      </section>
    </div>

    <section className="panel overflow-hidden">
      <div className="border-b border-line p-4"><div className="label">Batch history</div><h2 className="text-lg font-black uppercase">Recent code drops</h2></div>
      <div className="divide-y divide-line">{snapshot.batches.length ? snapshot.batches.map((batch) => <BatchRow key={batch.id} batch={batch}/>) : <div className="p-6 text-center text-sm text-gray-500">No public code batches yet.</div>}</div>
    </section>
  </div>;
}

function BatchFocus({ batch }: { batch: VotingBatchSummary }) {
  return <div className="p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><StateBadge state={batch.state}/><div className="mt-2 text-sm font-black">{batch.quantity} codes · released {formatPhDate(batch.releaseAt)}</div></div>{batch.pace !== "WAITING" && <span className={`text-xs font-black uppercase ${batch.pace === "FAST" ? "text-emerald-700" : batch.pace === "SLOW" ? "text-amber-700" : "text-gray-500"}`}>{batch.pace} pace</span>}</div>
    <div className="mt-4 grid grid-cols-3 gap-2"><Mini label="Used" value={batch.usedCount}/><Mini label="Remaining" value={batch.remainingCount}/><Mini label="Rate / min" value={batch.consumptionRatePerMinute}/></div>
    <div className="mt-3 text-sm text-gray-600">{batch.state === "SOLD_OUT" ? <>Sold out in <strong className="text-ink">{duration(batch.elapsedSeconds)}</strong>.</> : <>Active for <strong className="text-ink">{duration(batch.elapsedSeconds)}</strong>.</>} {batch.halfConsumedAt ? <>50% was consumed in <strong className="text-ink">{duration(secondsBetween(batch.releaseAt, batch.halfConsumedAt))}</strong>.</> : null}</div>
    {batch.recommendation && <div className={`mt-3 border-l-4 p-3 text-sm font-bold ${batch.pace === "FAST" ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-amber-400 bg-amber-50 text-amber-900"}`}>{batch.recommendation}</div>}
  </div>;
}

function BatchRow({ batch }: { batch: VotingBatchSummary }) {
  return <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StateBadge state={batch.state}/><strong>{batch.quantity} codes</strong></div><div className="mt-1 text-xs text-gray-500">{formatPhDate(batch.releaseAt)}{batch.state === "SOLD_OUT" ? ` · sold out in ${duration(batch.elapsedSeconds)}` : batch.state === "ACTIVE" ? ` · ${batch.usedCount}/${batch.quantity} consumed` : ""}</div>{batch.state === "ACTIVE" || batch.state === "SOLD_OUT" ? <div className="mt-1 text-xs font-bold text-gray-600">{batch.consumptionRatePerMinute} codes/min{batch.recommendation ? ` · ${batch.recommendation}` : ""}</div> : null}</div>
    {batch.state === "SCHEDULED" && <div className="flex gap-2">
      <form action="/api/admin/voting-codes" method="post"><input type="hidden" name="action" value="release-batch-now"/><input type="hidden" name="batchId" value={batch.id}/><SubmitButton className="btn-ghost px-3 py-2 text-xs" pendingLabel="Releasing…">Release now</SubmitButton></form>
      <form action="/api/admin/voting-codes" method="post"><input type="hidden" name="action" value="cancel-batch"/><input type="hidden" name="batchId" value={batch.id}/><SubmitButton className="btn-ghost border-red-200 px-3 py-2 text-xs text-red-700" pendingLabel="Cancelling…">Cancel</SubmitButton></form>
    </div>}
  </div>;
}

function Mini({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-line bg-paper p-3"><div className="text-xl font-black tabular-nums">{value}</div><div className="label">{label}</div></div>; }
function StateBadge({ state }: { state: VotingBatchSummary["state"] }) { const cls = state === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : state === "SOLD_OUT" ? "bg-ink text-white" : state === "CANCELLED" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${cls}`}>{state.replaceAll("_", " ")}</span>; }
function formatPhDate(value: string) { return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function secondsBetween(start: string, end: string) { return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)); }
function duration(seconds: number) { const whole = Math.max(0, Math.round(seconds)); const minutes = Math.floor(whole / 60); const remainder = whole % 60; if (minutes >= 60) { const hours = Math.floor(minutes / 60); return `${hours}h ${minutes % 60}m`; } return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`; }
