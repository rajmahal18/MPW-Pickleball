"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronRight, Loader2, Trash2 } from "lucide-react";

export type CourtQueueMatchup = {
  id: string;
  queuePosition: number | null;
  courtLabel: string | null;
  divisionName: string;
  homeName: string;
  awayName: string;
  homeShortName: string;
  awayShortName: string;
  gamesPerMatchup: number;
  groupLabel: string | null;
  stage: string;
  roundLabel: string;
  status: string;
};

type QueueState = {
  activeCourtCount: number;
  queuedMatchups: CourtQueueMatchup[];
  availableMatchups: CourtQueueMatchup[];
};

type QueueResponse = {
  ok: boolean;
  message: string;
  state?: QueueState;
};

function statusLabel(status: string) {
  if (status === "READY") return "Ready";
  if (status === "LINEUP_PENDING") return "Pending lineup";
  if (status === "LIVE") return "Ongoing";
  return status.replaceAll("_", " ").toLowerCase().replace(/^./, (value) => value.toUpperCase());
}

function matchupScope(matchup: CourtQueueMatchup) {
  return matchup.groupLabel || matchup.stage.replaceAll("_", " ");
}

export default function TournamentCourtBoard({
  initialActiveCourtCount,
  initialQueuedMatchups,
  initialAvailableMatchups,
}: {
  initialActiveCourtCount: number;
  initialQueuedMatchups: CourtQueueMatchup[];
  initialAvailableMatchups: CourtQueueMatchup[];
}) {
  const [state, setState] = useState<QueueState>({
    activeCourtCount: initialActiveCourtCount,
    queuedMatchups: initialQueuedMatchups,
    availableMatchups: initialAvailableMatchups,
  });
  const [courtDraft, setCourtDraft] = useState(String(initialActiveCourtCount || 1));
  const [selectedMatchupId, setSelectedMatchupId] = useState("");
  const [selectedCourt, setSelectedCourt] = useState(initialActiveCourtCount ? "1" : "");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const courts = useMemo(
    () => Array.from({ length: state.activeCourtCount }, (_, index) => String(index + 1)),
    [state.activeCourtCount],
  );

  async function mutate(fields: Record<string, string>, busy: string) {
    setBusyKey(busy);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/tournament-structure", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "x-tournament-queue": "1",
        },
        body: new URLSearchParams(fields).toString(),
      });
      const payload = await response.json().catch(() => null) as QueueResponse | null;
      if (!payload) {
        throw new Error(response.status === 401 ? "Your session expired. Sign in again, then retry." : "Court queue update failed.");
      }
      if (!response.ok || !payload.ok || !payload.state) throw new Error(payload.message || "Court queue update failed.");
      setState(payload.state);
      setCourtDraft(String(payload.state.activeCourtCount || 1));
      if (!payload.state.activeCourtCount) setSelectedCourt("");
      else if (!selectedCourt || Number(selectedCourt) > payload.state.activeCourtCount) setSelectedCourt("1");
      setSelectedMatchupId("");
      setNotice({ tone: "success", text: payload.message });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Court queue update failed." });
    } finally {
      setBusyKey(null);
    }
  }

  const nextMatchup = state.queuedMatchups[0] ?? null;

  return <div className="space-y-5">
    <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
      <section className="rounded-lg border border-line bg-paper p-4">
        <div className="label">Active courts</div>
        <div className="mt-2 flex items-stretch gap-2">
          <input
            aria-label="Number of active courts"
            type="number"
            min={1}
            max={20}
            value={courtDraft}
            onChange={(event) => setCourtDraft(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2.5 text-lg font-black text-ink"
          />
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={() => mutate({ action: "update-active-courts", activeCourtCount: courtDraft }, "courts")}
            className="btn-primary min-w-20 rounded-md px-3 text-xs disabled:cursor-wait disabled:opacity-60"
          >
            {busyKey === "courts" ? <Loader2 size={15} className="animate-spin" /> : <><Check size={15}/>Apply</>}
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-gray-500">Use only the courts currently available for tournament play.</p>
      </section>

      <section className="rounded-lg border border-court/30 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label text-court">Add to court queue</div>
            <h3 className="mt-0.5 font-black uppercase text-ink">Queue a team matchup</h3>
          </div>
          <div className="text-xs font-bold text-gray-500">{state.availableMatchups.length} available</div>
        </div>
        <p className="mt-2 text-xs leading-5 text-gray-500">Queue order also controls Team Manager lineup access: each team can edit only its earliest unfinished queued matchup.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_auto]">
          <select
            aria-label="Available team matchup"
            value={selectedMatchupId}
            onChange={(event) => setSelectedMatchupId(event.target.value)}
            className="min-h-11 min-w-0 rounded-md border border-line bg-white px-3 py-2 text-sm font-bold"
          >
            <option value="">Select matchup…</option>
            {state.availableMatchups.map((matchup) => <option key={matchup.id} value={matchup.id}>
              {matchup.divisionName} · {matchup.homeShortName} vs {matchup.awayShortName} · Matches 1-{matchup.gamesPerMatchup}
            </option>)}
          </select>
          <select
            aria-label="Court"
            value={selectedCourt}
            disabled={!state.activeCourtCount}
            onChange={(event) => setSelectedCourt(event.target.value)}
            className="min-h-11 rounded-md border border-line bg-white px-3 py-2 text-sm font-black disabled:bg-gray-100"
          >
            <option value="">Court…</option>
            {courts.map((court) => <option key={court} value={court}>Court {court}</option>)}
          </select>
          <button
            type="button"
            disabled={busyKey !== null || !selectedMatchupId || !selectedCourt}
            onClick={() => mutate({ action: "queue-matchup", matchupId: selectedMatchupId, courtNumber: selectedCourt }, "add")}
            className="btn-primary min-h-11 rounded-md px-4 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyKey === "add" ? <Loader2 size={15} className="animate-spin" /> : <><ChevronRight size={15}/>Add to queue</>}
          </button>
        </div>
        {!state.activeCourtCount && <p className="mt-2 text-xs font-bold text-amber-800">Set the number of active courts first.</p>}
      </section>
    </div>

    {notice && <div role="status" className={`rounded-md border px-3 py-2 text-sm font-bold ${notice.tone === "success" ? "border-court/30 bg-court/5 text-court" : "border-red-300 bg-red-50 text-red-800"}`}>{notice.text}</div>}

    <section className="overflow-hidden rounded-xl border border-line bg-white shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-ink px-4 py-3 text-white">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.18em] text-white/70">Tournament-day board</div>
          <h3 className="text-lg font-black uppercase">Court schedule</h3>
        </div>
        <div className="text-xs font-bold text-white/80">
          {nextMatchup ? <>Next overall: <span className="text-white">#{nextMatchup.queuePosition} {nextMatchup.homeShortName} vs {nextMatchup.awayShortName}</span></> : "No matchup queued yet"}
        </div>
      </div>

      {state.activeCourtCount > 0 ? <div className="overflow-x-auto bg-paper p-3 sm:p-4">
        <div className="grid min-w-max grid-flow-col auto-cols-[minmax(280px,340px)] gap-3 lg:auto-cols-[minmax(300px,1fr)]">
          {courts.map((court) => {
            const courtMatchups = state.queuedMatchups.filter((matchup) => matchup.courtLabel === court);
            return <section key={court} className="min-h-[260px] overflow-hidden rounded-lg border border-line bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
                <div>
                  <div className="label text-court">Playing area</div>
                  <h4 className="text-xl font-black uppercase text-ink">Court {court}</h4>
                </div>
                <span className="rounded-full bg-paper px-2.5 py-1 text-[10px] font-black uppercase text-gray-600">{courtMatchups.length} queued</span>
              </div>
              <div className="space-y-3 p-3">
                {courtMatchups.map((matchup) => {
                  const positionIndex = state.queuedMatchups.findIndex((item) => item.id === matchup.id);
                  const isFirst = positionIndex === 0;
                  return <article key={matchup.id} className={`rounded-lg border p-3 ${isFirst ? "border-flame/50 bg-flame/5" : "border-line bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${isFirst ? "bg-flame text-white" : "bg-ink text-white"}`}>#{matchup.queuePosition}</span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-ink">{matchup.homeShortName} vs {matchup.awayShortName}</div>
                          <div className="mt-0.5 truncate text-[11px] text-gray-500">{matchup.divisionName} · {matchupScope(matchup)}</div>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${matchup.status === "READY" ? "bg-court/10 text-court" : "bg-amber-100 text-amber-900"}`}>{statusLabel(matchup.status)}</span>
                    </div>

                    <div className="mt-3 rounded-md bg-paper px-3 py-2 text-xs text-gray-600">
                      <div className="font-bold text-ink">{matchup.roundLabel}</div>
                      <div className="mt-0.5">Matches 1-{matchup.gamesPerMatchup}</div>
                    </div>

                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 border-t border-line pt-3">
                      <label className="min-w-0">
                        <span className="sr-only">Move {matchup.homeShortName} vs {matchup.awayShortName} to court</span>
                        <select
                          value={matchup.courtLabel || ""}
                          disabled={busyKey !== null}
                          onChange={(event) => mutate({ action: "update-queue-court", matchupId: matchup.id, courtNumber: event.target.value }, `court:${matchup.id}`)}
                          className="h-9 w-full rounded-md border border-line bg-white px-2 text-xs font-black disabled:opacity-60"
                        >
                          {courts.map((courtOption) => <option key={courtOption} value={courtOption}>Court {courtOption}</option>)}
                        </select>
                      </label>
                      <div className="flex gap-1">
                        <button type="button" title="Move earlier" aria-label="Move earlier" disabled={busyKey !== null || positionIndex <= 0} onClick={() => mutate({ action: "move-queue-item", matchupId: matchup.id, direction: "up" }, `up:${matchup.id}`)} className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-ink disabled:opacity-30">{busyKey === `up:${matchup.id}` ? <Loader2 size={14} className="animate-spin"/> : <ArrowUp size={14}/>}</button>
                        <button type="button" title="Move later" aria-label="Move later" disabled={busyKey !== null || positionIndex >= state.queuedMatchups.length - 1} onClick={() => mutate({ action: "move-queue-item", matchupId: matchup.id, direction: "down" }, `down:${matchup.id}`)} className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-ink disabled:opacity-30">{busyKey === `down:${matchup.id}` ? <Loader2 size={14} className="animate-spin"/> : <ArrowDown size={14}/>}</button>
                        <button type="button" title="Remove from queue" aria-label="Remove from queue" disabled={busyKey !== null} onClick={() => mutate({ action: "unqueue-matchup", matchupId: matchup.id }, `remove:${matchup.id}`)} className="grid h-9 w-9 place-items-center rounded-md border border-red-200 bg-white text-red-700 disabled:opacity-30">{busyKey === `remove:${matchup.id}` ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>}</button>
                      </div>
                    </div>
                  </article>;
                })}
                {!courtMatchups.length && <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-line bg-paper/60 p-5 text-center text-xs font-bold text-gray-400">No matchup assigned to Court {court} yet.</div>}
              </div>
            </section>;
          })}
        </div>
      </div> : <div className="p-8 text-center text-sm font-bold text-gray-500">Set the number of active courts to create the tournament-day board.</div>}
    </section>

    <p className="text-xs leading-5 text-gray-500">Queue numbers are the overall call order. Court columns show where each team matchup will be played; a whole team matchup stays one block covering all of its configured matches.</p>
  </div>;
}
