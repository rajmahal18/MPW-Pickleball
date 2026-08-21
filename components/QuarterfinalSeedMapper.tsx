"use client";

import { useMemo, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import type { QualificationSourceOption } from "@/lib/tournament/bracket-seeding";

type SeedPair = { home: string; away: string };

type Props = {
  divisionId: string;
  options: QualificationSourceOption[];
  initial: SeedPair[];
  stage?: "ROUND_OF_16" | "QUARTERFINAL" | "SEMIFINAL";
};

export default function QuarterfinalSeedMapper({ divisionId, options, initial, stage = "QUARTERFINAL" }: Props) {
  const slotCount = stage === "ROUND_OF_16" ? 8 : stage === "QUARTERFINAL" ? 4 : 2;
  const shortLabel = stage === "ROUND_OF_16" ? "R16" : stage === "QUARTERFINAL" ? "QF" : "SF";
  const stageLabel = stage === "ROUND_OF_16" ? "Round of 16" : stage === "QUARTERFINAL" ? "Quarterfinal" : "Semifinal";
  const [slots, setSlots] = useState<SeedPair[]>(() => Array.from({ length: slotCount }, (_, index) => ({
    home: initial[index]?.home ?? "",
    away: initial[index]?.away ?? "",
  })));

  const selected = useMemo(() => slots.flatMap((slot) => [slot.home, slot.away]).filter(Boolean), [slots]);

  const update = (index: number, side: keyof SeedPair, value: string) => {
    setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? { ...slot, [side]: value } : slot));
  };

  const picker = (index: number, side: keyof SeedPair, label: string) => {
    const currentValue = slots[index]?.[side] ?? "";
    const usedElsewhere = new Set(selected.filter((value) => value !== currentValue));
    return <label className="block">
      <span className="label">{label}</span>
      <select
        name={`seed-${index + 1}-${side}`}
        value={currentValue}
        onChange={(event) => update(index, side, event.target.value)}
        className="mt-1 w-full rounded-md border border-line bg-white p-3 text-sm font-bold outline-none transition focus:border-court focus:ring-2 focus:ring-court/10"
      >
        <option value="">Choose seed source</option>
        {options.filter((option) => option.value === currentValue || !usedElsewhere.has(option.value)).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>;
  };

  const remaining = Math.max(0, options.length - new Set(selected).size);

  return <form action="/api/admin/tournament-structure" method="post" className="mt-4 space-y-3">
    <input type="hidden" name="action" value="configure-bracket-seeds"/>
    <input type="hidden" name="divisionId" value={divisionId}/>
    <input type="hidden" name="stage" value={stage}/>
    <div className="grid gap-3 lg:grid-cols-2">
      {Array.from({ length: slotCount }, (_, index) => <div key={index} className="rounded-lg border border-line bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-black uppercase text-ink">{stageLabel} {index + 1}</div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{slots[index]?.home && slots[index]?.away ? "Ready" : "Needs seeds"}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {picker(index, "home", "Top box")}
          {picker(index, "away", "Bottom box")}
        </div>
      </div>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-gray-500">Selected seed sources disappear from the other boxes. <strong>{remaining}</strong> source{remaining === 1 ? "" : "s"} left.</p>
      <SubmitButton className="btn-primary rounded-md" pendingLabel="Saving bracket...">Save {shortLabel} bracket map</SubmitButton>
    </div>
  </form>;
}
