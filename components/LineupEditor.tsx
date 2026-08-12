"use client";

import { useMemo, useRef, useState } from "react";

type PlayerOption = { id: string; name: string; eligible: boolean };
type Slot = { slot: number; playerAId: string; playerBId: string; locked: boolean; gameStatus?: string | null };
type ApiPayload = { ok: true; message: string } | { ok: false; error: string };

type Selection = { playerAId: string; playerBId: string };

function initialSelections(required: number, players: PlayerOption[], slots: Slot[]) {
  const values: Selection[] = Array.from({ length: required }, (_, index) => {
    const current = slots.find((slot) => slot.slot === index + 1);
    return { playerAId: current?.playerAId || "", playerBId: current?.playerBId || "" };
  });
  // Auto-fill only when every eligible player must participate (for example 14 players → 7 games).
  // In a 5-of-7-pairs knockout, guessing the first 10 players is dangerous: the manager should
  // intentionally choose who sits out. Existing saved/locked slots are always preserved.
  const eligiblePlayers = players.filter((player) => player.eligible);
  const shouldAutoFill = eligiblePlayers.length === required * 2;
  if (shouldAutoFill) {
    const used = new Set(values.flatMap((slot) => [slot.playerAId, slot.playerBId]).filter(Boolean));
    for (const value of values) {
      if (!value.playerAId) {
        const candidate = eligiblePlayers.find((player) => !used.has(player.id));
        if (candidate) { value.playerAId = candidate.id; used.add(candidate.id); }
      }
      if (!value.playerBId) {
        const candidate = eligiblePlayers.find((player) => !used.has(player.id));
        if (candidate) { value.playerBId = candidate.id; used.add(candidate.id); }
      }
    }
  }
  return values;
}

export default function LineupEditor({ matchupId, required, players, slots }: { matchupId: string; required: number; players: PlayerOption[]; slots: Slot[] }) {
  const [selected, setSelected] = useState(() => initialSelections(required, players, slots));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const savedSnapshotRef = useRef(JSON.stringify(Array.from({ length: required }, (_, index) => {
    const current = slots.find((slot) => slot.slot === index + 1);
    return { playerAId: current?.playerAId || "", playerBId: current?.playerBId || "" };
  })));
  const lockedSlots = new Map(slots.filter((slot) => slot.locked).map((slot) => [slot.slot, slot]));

  const allIds = selected.flatMap((slot) => [slot.playerAId, slot.playerBId]).filter(Boolean);
  const duplicatePlayer = new Set(allIds).size !== allIds.length;
  const incomplete = selected.some((slot) => !slot.playerAId || !slot.playerBId || slot.playerAId === slot.playerBId);
  const lockedPlayerIds = new Set(slots.filter((slot) => slot.locked).flatMap((slot) => [slot.playerAId, slot.playerBId]).filter(Boolean));
  const completedPairs = selected.filter((slot) => slot.playerAId && slot.playerBId && slot.playerAId !== slot.playerBId).length;
  const selectedPlayerCount = new Set(allIds).size;
  const eligiblePlayers = players.filter((player) => player.eligible);
  const availablePlayers = eligiblePlayers.filter((player) => !allIds.includes(player.id));
  const missingPlayerSlots = Math.max(0, required * 2 - allIds.length);
  const dirty = JSON.stringify(selected) !== savedSnapshotRef.current;

  const playerUsage = useMemo(() => {
    const usage = new Map<string, { game: number; locked: boolean }>();
    selected.forEach((selection, index) => {
      const game = index + 1;
      if (selection.playerAId) usage.set(selection.playerAId, { game, locked: Boolean(lockedSlots.get(game)) });
      if (selection.playerBId) usage.set(selection.playerBId, { game, locked: Boolean(lockedSlots.get(game)) });
    });
    return usage;
  }, [selected, slots]);

  async function save() {
    if (busyRef.current || incomplete || duplicatePlayer) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/leader/matchups/${matchupId}/lineup`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ slots: selected }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.ok ? "Lineup save failed." : payload.error);
      savedSnapshotRef.current = JSON.stringify(selected);
      setMessage(payload.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lineup save failed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function update(slotIndex: number, field: keyof Selection, value: string) {
    setSelected((current) => current.map((slot, index) => index === slotIndex ? { ...slot, [field]: value } : slot));
    setMessage(null);
    setError(null);
  }

  return <div className="panel mt-6 overflow-hidden">
    <div className="border-b border-line bg-court/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label text-court">Manager lineup</div>
          <h2 className="font-black uppercase">Match lineup</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">Choose two players for each game. Future slots stay editable; a game becomes protected only after play starts.</p>
        </div>
        <span className={`border px-3 py-2 text-xs font-black uppercase ${incomplete || duplicatePlayer ? "border-amber-300 bg-amber-50 text-amber-900" : dirty ? "border-court/30 bg-white text-court" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
          {duplicatePlayer ? "Duplicate player" : incomplete ? `${required - completedPairs} pair${required - completedPairs === 1 ? "" : "s"} still needed` : dirty ? "Ready to save" : "Lineup saved"}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Pairs ready" value={`${completedPairs}/${required}`} tone={completedPairs === required ? "good" : "warn"}/>
        <MiniStat label="Players selected" value={`${selectedPlayerCount}/${required * 2}`} tone={selectedPlayerCount === required * 2 ? "good" : "warn"}/>
        <MiniStat label="Eligible unpaired" value={String(availablePlayers.length)} tone="neutral"/>
        <MiniStat label="Played / protected" value={`${lockedSlots.size}/${required}`} tone={lockedSlots.size ? "locked" : "neutral"}/>
      </div>
    </div>

    <section className="border-b border-line bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><div className="label">Players at a glance</div><h3 className="font-black uppercase">Roster status</h3></div>
        <div className="text-xs text-gray-500">Selected players show their game number. Unpaired players are immediately visible.</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {players.map((player) => {
          const usage = playerUsage.get(player.id);
          const state = usage?.locked ? "locked" : usage ? player.eligible ? "selected" : "unavailable-selected" : player.eligible ? "available" : "unavailable";
          const style = state === "locked"
            ? "border-gray-300 bg-gray-100 text-gray-700"
            : state === "selected"
              ? "border-court/30 bg-court/10 text-court"
              : state === "unavailable-selected"
                ? "border-red-200 bg-red-50 text-red-800"
                : state === "available"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-line bg-gray-50 text-gray-400";
          const status = state === "locked" ? `G${usage!.game} · played` : state === "selected" ? `G${usage!.game} · selected` : state === "available" ? "Unpaired" : "Unavailable";
          return <div key={player.id} className={`flex items-center gap-2 border px-3 py-2 text-xs ${style}`}>
            <span className="font-bold">{player.name}</span>
            <span className="whitespace-nowrap font-black uppercase tracking-wide">{status}</span>
          </div>;
        })}
      </div>
      {!players.length && <div className="mt-3 border border-dashed border-line p-4 text-sm text-gray-500">No team players are available for this matchup.</div>}
    </section>

    <div className="divide-y divide-line">
      {Array.from({ length: required }, (_, index) => {
        const slotNumber = index + 1;
        const locked = lockedSlots.get(slotNumber);
        const value = selected[index]!;
        const pairComplete = Boolean(value.playerAId && value.playerBId && value.playerAId !== value.playerBId);
        const blockedForPlayerA = new Set(lockedPlayerIds);
        const blockedForPlayerB = new Set(lockedPlayerIds);
        blockedForPlayerA.delete(value.playerAId);
        blockedForPlayerB.delete(value.playerBId);
        if (value.playerBId) blockedForPlayerA.add(value.playerBId);
        if (value.playerAId) blockedForPlayerB.add(value.playerAId);
        const rowTone = locked ? "bg-gray-50/80" : pairComplete ? "bg-emerald-50/25" : "bg-amber-50/35";
        return <div className={`grid gap-3 p-4 lg:grid-cols-[130px_1fr_40px_1fr_150px] lg:items-center ${rowTone}`} key={slotNumber}>
          <div>
            <div className="font-black uppercase">Game {slotNumber}</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-gray-500">{locked ? "Played slot" : pairComplete ? "Pair selected" : "Needs pair"}</div>
          </div>
          <PlayerSelect label="Player 1" value={value.playerAId} disabled={Boolean(locked)} players={players} blocked={blockedForPlayerA} usage={playerUsage} onChange={(next) => update(index, "playerAId", next)}/>
          <div className="hidden text-center text-xl font-black text-gray-300 lg:block">+</div>
          <PlayerSelect label="Player 2" value={value.playerBId} disabled={Boolean(locked)} players={players} blocked={blockedForPlayerB} usage={playerUsage} onChange={(next) => update(index, "playerBId", next)}/>
          <div className="lg:text-right"><SlotBadge locked={Boolean(locked)} complete={pairComplete} gameStatus={locked?.gameStatus}/></div>
        </div>;
      })}
    </div>
    <div className="border-t border-line bg-white p-4">
      {duplicatePlayer && <div className="mb-3 border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">Each player can appear only once in this matchup lineup. Check the roster chips above to see where each player is already assigned.</div>}
      {!duplicatePlayer && incomplete && <div className="mb-3 border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">{missingPlayerSlots} player slot{missingPlayerSlots === 1 ? "" : "s"} still need selection before this lineup can be saved.</div>}
      {error && <div className="mb-3 border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div>}
      {message && <div className="mb-3 border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ {message}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-xs text-gray-500">{dirty ? "You have unsaved lineup changes." : "No unsaved changes."}</div>
        <button type="button" onClick={() => void save()} disabled={busy || incomplete || duplicatePlayer || !dirty} className="btn-primary min-w-48 disabled:opacity-50">{busy ? "Saving lineup…" : dirty ? `Save ${required} game lineup` : "Lineup saved"}</button>
      </div>
    </div>
  </div>;
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "locked" | "neutral" }) {
  const style = tone === "good" ? "border-emerald-300 bg-emerald-50" : tone === "warn" ? "border-amber-300 bg-amber-50" : tone === "locked" ? "border-gray-300 bg-gray-100" : "border-line bg-white";
  return <div className={`border p-3 ${style}`}><div className="text-xl font-black tabular-nums">{value}</div><div className="label">{label}</div></div>;
}

function SlotBadge({ locked, complete, gameStatus }: { locked: boolean; complete: boolean; gameStatus?: string | null }) {
  if (locked) return <span className="inline-flex border border-gray-300 bg-gray-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-700">Protected · {(gameStatus || "played").replaceAll("_", " ")}</span>;
  if (complete) return <span className="inline-flex border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-800">✓ Pair ready</span>;
  return <span className="inline-flex border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-900">Pair needed</span>;
}

function PlayerSelect({ label, value, disabled, players, blocked, usage, onChange }: { label: string; value: string; disabled: boolean; players: PlayerOption[]; blocked: Set<string>; usage: Map<string, { game: number; locked: boolean }>; onChange: (value: string) => void }) {
  const selected = players.find((player) => player.id === value);
  return <label className="block"><span className="label lg:hidden">{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`w-full border p-3 font-bold disabled:bg-gray-50 disabled:text-gray-600 ${value ? "border-court/40 bg-white" : "border-amber-300 bg-amber-50"}`}>
    <option value="">{label}…</option>
    {players.map((player) => {
      const assigned = usage.get(player.id);
      const suffix = !player.eligible ? " (unavailable)" : assigned && player.id !== value ? ` (G${assigned.game})` : "";
      return <option key={player.id} value={player.id} disabled={(blocked.has(player.id) || !player.eligible) && player.id !== value}>{player.name}{suffix}</option>;
    })}
    {value && !selected && <option value={value}>Recorded player</option>}
  </select></label>;
}
