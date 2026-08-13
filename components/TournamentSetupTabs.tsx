"use client";

import { Children, type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, LayoutGrid, ListChecks, MapPinned, Users } from "lucide-react";

const tabs = [
  { id: "division", label: "Division", icon: ClipboardList },
  { id: "teams", label: "Teams & groups", icon: Users },
  { id: "lineups", label: "Lineup rules", icon: ListChecks },
  { id: "courts", label: "Courts", icon: MapPinned },
  { id: "matchups", label: "Matchups", icon: LayoutGrid },
] as const;

export default function TournamentSetupTabs({ children }: { children: ReactNode }) {
  const panels = Children.toArray(children);
  const [active, setActive] = useState<(typeof tabs)[number]["id"]>("division");

  useEffect(() => {
    const saved = window.sessionStorage.getItem("tournament-setup-tab");
    if (tabs.some((tab) => tab.id === saved)) setActive(saved as (typeof tabs)[number]["id"]);
  }, []);

  function selectTab(id: (typeof tabs)[number]["id"]) {
    setActive(id);
    window.sessionStorage.setItem("tournament-setup-tab", id);
  }

  const activeIndex = tabs.findIndex((tab) => tab.id === active);

  return <div className="mt-5">
    <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-line bg-white p-2 shadow-sm" role="tablist" aria-label="Tournament setup sections">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = active === tab.id;
        return <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={selected}
          onClick={() => selectTab(tab.id)}
          className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3.5 text-xs font-black transition md:text-sm ${selected ? "bg-ink text-white shadow-sm" : "text-gray-600 hover:bg-paper hover:text-court"}`}
        >
          <Icon size={16} aria-hidden="true" />
          {tab.label}
        </button>;
      })}
      <Link href="/admin/players" className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-lg border border-court/25 bg-court/5 px-3.5 text-xs font-black text-court hover:bg-court hover:text-white md:text-sm">Player Pool</Link>
    </div>

    <div className="mt-4">
      {panels.map((panel, index) => <div key={tabs[index]?.id ?? index} role="tabpanel" hidden={index !== activeIndex}>{panel}</div>)}
    </div>
  </div>;
}
