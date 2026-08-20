"use client";

import { useMemo, useRef, useState } from "react";
import PlayerAvatar from "@/components/PlayerAvatar";
import GenderIndicator from "@/components/GenderIndicator";
import AvatarPlayerSelect, { type AvatarPlayerOption } from "@/components/AvatarPlayerSelect";

type Category = "MENS" | "WOMENS" | "MIXED" | null;
type PlayerOption = { id: string; name: string; firstName: string; middleInitial: string | null; lastName: string; displayName: string | null; avatarUrl: string | null; sex: "MALE" | "FEMALE"; eligible: boolean };
type Slot = { slot: number; playerAId: string; playerBId: string; locked: boolean; gameStatus?: string | null };
type ApiPayload = { ok: true; message: string } | { ok: false; error: string };
type Selection = { playerAId: string; playerBId: string };

function baseSelections(required: number, slots: Slot[]) {
  return Array.from({ length: required }, (_, index) => {
    const current = slots.find((slot) => slot.slot === index + 1);
    return { playerAId: current?.playerAId || "", playerBId: current?.playerBId || "" };
  });
}

function categoryLabel(category: Category) {
  if (category === "MENS") return "Men's";
  if (category === "WOMENS") return "Women's";
  if (category === "MIXED") return "Mixed";
  return "Not set";
}

function playerAllowedByCategory(player: PlayerOption, category: Category, partner?: PlayerOption) {
  if (!category) return true;
  if (category === "MENS") return player.sex === "MALE";
  if (category === "WOMENS") return player.sex === "FEMALE";
  if (!partner) return true;
  return player.sex !== partner.sex;
}

function pairMatchesCategory(a: PlayerOption | undefined, b: PlayerOption | undefined, category: Category) {
  if (!a || !b || !category) return true;
  if (category === "MENS") return a.sex === "MALE" && b.sex === "MALE";
  if (category === "WOMENS") return a.sex === "FEMALE" && b.sex === "FEMALE";
  return a.sex !== b.sex;
}

export default function LineupEditor({ matchupId, required, players, slots, categories, readOnly = false }: { matchupId: string; required: number; players: PlayerOption[]; slots: Slot[]; categories: Category[]; readOnly?: boolean }) {
  const initial = baseSelections(required, slots);
  const [selected, setSelected] = useState<Selection[]>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const savedSnapshotRef = useRef(JSON.stringify(initial));
  const lockedSlots = useMemo(() => new Map(slots.filter((slot) => slot.locked).map((slot) => [slot.slot, slot])), [slots]);
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  const allIds = selected.flatMap((slot) => [slot.playerAId, slot.playerBId]).filter(Boolean);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const id of allIds) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [allIds.join("|")]);
  const duplicateIds = new Set([...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id));
  const duplicatePlayer = duplicateIds.size > 0;
  const invalidCategorySlots = selected.map((slot, index) => {
    if (lockedSlots.has(index + 1) || !slot.playerAId || !slot.playerBId) return false;
    return !pairMatchesCategory(playerById.get(slot.playerAId), playerById.get(slot.playerBId), categories[index] ?? null);
  });
  const hasCategoryError = invalidCategorySlots.some(Boolean);
  const incomplete = selected.some((slot) => !slot.playerAId || !slot.playerBId || slot.playerAId === slot.playerBId);
  const completedPairs = selected.filter((slot, index) => slot.playerAId && slot.playerBId && slot.playerAId !== slot.playerBId && !invalidCategorySlots[index]).length;
  const selectedPlayerCount = new Set(allIds).size;
  const eligiblePlayers = players.filter((player) => player.eligible);
  const availablePlayers = eligiblePlayers.filter((player) => !allIds.includes(player.id));
  const missingPlayerSlots = Math.max(0, required * 2 - allIds.length);
  const dirty = JSON.stringify(selected) !== savedSnapshotRef.current;

  const playerUsage = useMemo(() => {
    const usage = new Map<string, Array<{ match: number; locked: boolean }>>();
    selected.forEach((selection, index) => {
      const match = index + 1;
      for (const id of [selection.playerAId, selection.playerBId].filter(Boolean)) {
        const rows = usage.get(id) ?? [];
        rows.push({ match, locked: Boolean(lockedSlots.get(match)) });
        usage.set(id, rows);
      }
    });
    return usage;
  }, [selected, lockedSlots]);

  async function save() {
    if (busyRef.current || incomplete || duplicatePlayer || hasCategoryError) return;
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

  function emptyEditableSlots() {
    setSelected((current) => current.map((slot, index) => lockedSlots.has(index + 1) ? slot : { playerAId: "", playerBId: "" }));
    setMessage(null);
    setError(null);
  }

  function fillEditableSlots() {
    const next = selected.map((slot) => ({ ...slot }));
    const used = new Set<string>();
    next.forEach((slot, index) => {
      if (!lockedSlots.has(index + 1)) {
        slot.playerAId = "";
        slot.playerBId = "";
      } else {
        if (slot.playerAId) used.add(slot.playerAId);
        if (slot.playerBId) used.add(slot.playerBId);
      }
    });
    const take = (sex?: "MALE" | "FEMALE") => eligiblePlayers.find((player) => !used.has(player.id) && (!sex || player.sex === sex));
    for (let index = 0; index < required; index += 1) {
      if (lockedSlots.has(index + 1)) continue;
      const category = categories[index] ?? null;
      let first: PlayerOption | undefined;
      let second: PlayerOption | undefined;
      if (category === "MENS") {
        first = take("MALE"); if (first) used.add(first.id);
        second = take("MALE");
      } else if (category === "WOMENS") {
        first = take("FEMALE"); if (first) used.add(first.id);
        second = take("FEMALE");
      } else if (category === "MIXED") {
        first = take("MALE"); if (first) used.add(first.id);
        second = take("FEMALE");
      } else {
        first = take(); if (first) used.add(first.id);
        second = take();
      }
      if (!first || !second) {
        setError(`Cannot fill all slots automatically. Match ${index + 1} (${categoryLabel(category)}) does not have enough eligible unused players.`);
        return;
      }
      used.add(second.id);
      next[index] = { playerAId: first.id, playerBId: second.id };
    }
    setSelected(next);
    setMessage(null);
    setError(null);
  }

  if (readOnly) return <section className="mt-6 border border-line bg-white">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-emerald-50 p-4">
      <div><div className="label text-emerald-700">Manager lineup</div><h2 className="font-black uppercase">Submitted lineup</h2><p className="mt-1 text-sm text-gray-600">This lineup is final and can no longer be edited by the Team Manager.</p></div>
      <span className="border border-emerald-300 bg-white px-3 py-2 text-xs font-black uppercase text-emerald-800">Submitted · locked</span>
    </div>
    <div className="divide-y divide-line">
      {selected.map((selection, index) => {
        const playerA = playerById.get(selection.playerAId);
        const playerB = playerById.get(selection.playerBId);
        return <div key={index} className="grid gap-3 p-4 sm:grid-cols-[120px_1fr] sm:items-center">
          <div><div className="font-black uppercase">Match {index + 1}</div><div className="mt-1 text-[10px] font-black uppercase tracking-widest text-gray-500">{categoryLabel(categories[index] ?? null)}</div></div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <SubmittedPlayer player={playerA}/><span className="hidden font-black text-gray-300 sm:block">+</span><SubmittedPlayer player={playerB}/>
          </div>
        </div>;
      })}
    </div>
  </section>;

  return <div className="panel mt-6 overflow-visible">
    <div className="border-b border-line bg-court/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label text-court">Manager lineup</div>
          <h2 className="font-black uppercase">Match lineup</h2>
          <p className="mt-1 hidden max-w-3xl text-sm text-gray-600 md:block">Choose two players for each match. Category rules and duplicate-player protection are enforced before save and again on the server.</p>
        </div>
        <span className={`border px-3 py-2 text-xs font-black uppercase ${duplicatePlayer || hasCategoryError ? "border-red-300 bg-red-50 text-red-800" : incomplete ? "border-amber-300 bg-amber-50 text-amber-900" : dirty ? "border-court/30 bg-white text-court" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
          {duplicatePlayer ? "Duplicate player" : hasCategoryError ? "Category mismatch" : incomplete ? `${required - completedPairs} pair${required - completedPairs === 1 ? "" : "s"} still needed` : dirty ? "Ready to save" : "Lineup saved"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={fillEditableSlots} className="btn-primary px-3 py-2 text-xs">Fill all editable slots</button>
        <button type="button" onClick={emptyEditableSlots} className="btn-ghost px-3 py-2 text-xs">Empty all editable slots</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MiniStat label="Pairs ready" value={`${completedPairs}/${required}`} tone={completedPairs === required ? "good" : "warn"}/>
        <MiniStat label="Players selected" value={`${selectedPlayerCount}/${required * 2}`} tone={selectedPlayerCount === required * 2 ? "good" : "warn"}/>
        <MiniStat label="Eligible unpaired" value={String(availablePlayers.length)} tone="neutral"/>
        <MiniStat label="Played / protected" value={`${lockedSlots.size}/${required}`} tone={lockedSlots.size ? "locked" : "neutral"}/>
      </div>
    </div>

    <section className="border-b border-line bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><div className="label">Players</div><h3 className="font-black uppercase">Roster status</h3></div>
        <div className="hidden text-xs text-gray-500 md:block">Green = available, red = duplicate/unavailable, gray = already protected by played match.</div>
      </div>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {players.map((player) => {
          const usage = playerUsage.get(player.id) ?? [];
          const duplicate = duplicateIds.has(player.id);
          const locked = usage.some((row) => row.locked);
          const selectedNow = usage.length > 0;
          const style = duplicate
            ? "border-red-300 bg-red-50 text-red-800"
            : locked
              ? "border-gray-300 bg-gray-100 text-gray-700"
              : selectedNow
                ? "border-court/30 bg-court/10 text-court"
                : player.eligible
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-700";
          const status = duplicate ? "Duplicate" : locked ? `M${usage[0]!.match} · played` : selectedNow ? `M${usage[0]!.match} · selected` : player.eligible ? "Available" : "Unavailable";
          return <div key={player.id} className={`flex shrink-0 items-center gap-2 border px-2.5 py-2 text-xs ${style}`}>
            <PlayerAvatar {...player} size="sm"/><span className="flex items-center gap-1 font-bold">{player.name}<GenderIndicator sex={player.sex} className="text-sm"/></span><span className="whitespace-nowrap font-black uppercase tracking-wide">{status}</span>
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
        const category = categories[index] ?? null;
        const pairComplete = Boolean(value.playerAId && value.playerBId && value.playerAId !== value.playerBId);
        const categoryError = invalidCategorySlots[index];
        const rowTone = locked ? "bg-gray-50/80" : categoryError ? "bg-red-50/40" : pairComplete ? "bg-emerald-50/25" : "bg-amber-50/35";
        return <div className={`grid gap-3 p-4 lg:grid-cols-[150px_1fr_40px_1fr_150px] lg:items-center ${rowTone}`} key={slotNumber}>
          <div>
            <div className="font-black uppercase">Match {slotNumber}</div>
            <div className="mt-1 inline-flex border border-line bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest">{categoryLabel(category)}</div>
          </div>
          <PlayerSelect label="Player 1" value={value.playerAId} otherValue={value.playerBId} slotNumber={slotNumber} disabled={Boolean(locked)} players={players} category={category} usage={playerUsage} duplicateIds={duplicateIds} onChange={(next) => update(index, "playerAId", next)}/>
          <div className="hidden text-center text-xl font-black text-gray-300 lg:block">+</div>
          <PlayerSelect label="Player 2" value={value.playerBId} otherValue={value.playerAId} slotNumber={slotNumber} disabled={Boolean(locked)} players={players} category={category} usage={playerUsage} duplicateIds={duplicateIds} onChange={(next) => update(index, "playerBId", next)}/>
          <div className="lg:text-right"><SlotBadge locked={Boolean(locked)} complete={pairComplete && !categoryError} invalid={Boolean(categoryError)} gameStatus={locked?.gameStatus}/></div>
        </div>;
      })}
    </div>
    <div className="border-t border-line bg-white p-4">
      {duplicatePlayer && <div className="mb-3 border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">Duplicate players are shown in red. Each player can appear only once in this team matchup.</div>}
      {hasCategoryError && <div className="mb-3 border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">One or more pairs do not match the configured Men's / Women's / Mixed restriction.</div>}
      {!duplicatePlayer && !hasCategoryError && incomplete && <div className="mb-3 border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">{missingPlayerSlots} player slot{missingPlayerSlots === 1 ? "" : "s"} still need selection before this lineup can be saved.</div>}
      {error && <div className="mb-3 border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div>}
      {message && <div className="mb-3 border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ {message}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-xs text-gray-500">{dirty ? "You have unsaved lineup changes." : "No unsaved changes."}</div>
        <button type="button" onClick={() => void save()} disabled={busy || incomplete || duplicatePlayer || hasCategoryError || !dirty} className="btn-primary w-full disabled:opacity-50 sm:w-auto sm:min-w-48">{busy ? "Saving lineup…" : dirty ? `Save ${required}-match lineup` : "Lineup saved"}</button>
      </div>
    </div>
  </div>;
}

function SubmittedPlayer({ player }: { player?: PlayerOption }) {
  if (!player) return <div className="border border-dashed border-line px-3 py-2 text-sm font-bold text-gray-500">Player unavailable</div>;
  return <div className="flex min-w-0 items-center gap-2 border border-line bg-paper/50 px-3 py-2"><PlayerAvatar {...player} size="sm"/><span className="min-w-0 truncate text-sm font-black">{player.name}</span><GenderIndicator sex={player.sex} className="text-sm"/></div>;
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "locked" | "neutral" }) {
  const style = tone === "good" ? "border-emerald-300 bg-emerald-50" : tone === "warn" ? "border-amber-300 bg-amber-50" : tone === "locked" ? "border-gray-300 bg-gray-100" : "border-line bg-white";
  return <div className={`border p-3 ${style}`}><div className="text-xl font-black tabular-nums">{value}</div><div className="label">{label}</div></div>;
}

function SlotBadge({ locked, complete, invalid, gameStatus }: { locked: boolean; complete: boolean; invalid: boolean; gameStatus?: string | null }) {
  if (locked) return <span className="inline-flex border border-gray-300 bg-gray-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-700">Protected · {(gameStatus || "played").replaceAll("_", " ")}</span>;
  if (invalid) return <span className="inline-flex border border-red-300 bg-red-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-800">Wrong category</span>;
  if (complete) return <span className="inline-flex border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-800">✓ Pair ready</span>;
  return <span className="inline-flex border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-900">Pair needed</span>;
}

function PlayerSelect({ label, value, otherValue, slotNumber, disabled, players, category, usage, duplicateIds, onChange }: { label: string; value: string; otherValue: string; slotNumber: number; disabled: boolean; players: PlayerOption[]; category: Category; usage: Map<string, Array<{ match: number; locked: boolean }>>; duplicateIds: Set<string>; onChange: (value: string) => void }) {
  const selected = players.find((player) => player.id === value);
  const partner = players.find((player) => player.id === otherValue);
  const selectedInvalid = selected ? !playerAllowedByCategory(selected, category, partner) || duplicateIds.has(selected.id) || !selected.eligible : false;
  const options: AvatarPlayerOption[] = players.map((player) => {
    const rows = usage.get(player.id) ?? [];
    const usedElsewhere = rows.some((row) => row.match !== slotNumber) || (rows.filter((row) => row.match === slotNumber).length > 1 && player.id !== value);
    const categoryAllowed = playerAllowedByCategory(player, category, partner);
    const allowed = player.eligible && categoryAllowed && !usedElsewhere && player.id !== otherValue;
    const categoryReason = category === "MENS" ? "Men's only" : category === "WOMENS" ? "Women's only" : category === "MIXED" && partner ? "Mixed requires opposite sex" : "Category restriction";
    const meta = !player.eligible ? "Unavailable" : player.id === otherValue ? "Already in this pair" : usedElsewhere ? `Used in Match ${rows.find((row) => row.match !== slotNumber)?.match ?? rows[0]?.match}` : !categoryAllowed ? categoryReason : "Available";
    return {
      id: player.id,
      label: player.name,
      meta,
      disabled: !allowed && player.id !== value,
      tone: allowed && !duplicateIds.has(player.id) ? "available" : "blocked",
      avatar: player,
    };
  });
  return <div><span className="label lg:hidden">{label}</span><AvatarPlayerSelect
    value={value}
    disabled={disabled}
    options={options}
    placeholder={`${label}…`}
    onValueChange={onChange}
    triggerTone={selectedInvalid ? "blocked" : value ? "available" : "warning"}
  /></div>;
}
