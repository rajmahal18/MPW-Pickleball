"use client";

import { Children, type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, LayoutGrid, ListChecks, MapPinned, Users } from "lucide-react";

const allTabs = [
  { id: "division", label: "Division", icon: ClipboardList, panelIndex: 0 },
  { id: "teams", label: "Teams & groups", pairLabel: "Pairs & groups", icon: Users, panelIndex: 1 },
  { id: "lineups", label: "Lineup rules", icon: ListChecks, panelIndex: 2 },
  { id: "courts", label: "Courts", icon: MapPinned, panelIndex: 3 },
  { id: "matchups", label: "Matchups", icon: LayoutGrid, panelIndex: 4 },
] as const;

type TabId = (typeof allTabs)[number]["id"];

export default function TournamentSetupTabs({ children, pairMode = false }: { children: ReactNode; pairMode?: boolean }) {
  const panels = Children.toArray(children);
  const tabs = useMemo(() => allTabs.filter((tab) => !(pairMode && tab.id === "lineups")), [pairMode]);
  const [active, setActive] = useState<TabId>("division");

  useEffect(() => {
    const saved = window.sessionStorage.getItem("tournament-setup-tab") as TabId | null;
    if (saved && tabs.some((tab) => tab.id === saved)) setActive(saved);
    else if (!tabs.some((tab) => tab.id === active)) setActive("division");
  }, [active, tabs]);

  function selectTab(id: TabId) {
    setActive(id);
    window.sessionStorage.setItem("tournament-setup-tab", id);
  }

  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0]!;

  return <div className="mt-5">
    <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-line bg-white p-2 shadow-sm" role="tablist" aria-label="Tournament setup sections">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = active === tab.id;
        const label = pairMode && "pairLabel" in tab && tab.pairLabel ? tab.pairLabel : tab.label;
        return <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={selected}
          onClick={() => selectTab(tab.id)}
          className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3.5 text-xs font-black transition md:text-sm ${selected ? "bg-ink text-white shadow-sm" : "text-gray-600 hover:bg-paper hover:text-court"}`}
        >
          <Icon size={16} aria-hidden="true" />
          {label}
        </button>;
      })}
      <Link href="/admin/players" className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-lg border border-court/25 bg-court/5 px-3.5 text-xs font-black text-court hover:bg-court hover:text-white md:text-sm">Player Pool</Link>
    </div>

    <div className="mt-4">
      {panels.map((panel, index) => <div key={allTabs[index]?.id ?? index} role="tabpanel" hidden={index !== activeTab.panelIndex}>{panel}</div>)}
    </div>
  </div>;
}
