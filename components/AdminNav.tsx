"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Gauge, History, KeyRound, RotateCcw, Settings2, Users, Vote } from "lucide-react";

const primary = [
  { label: "Overview", href: "/admin", icon: Gauge },
  { label: "Tournament Setup", href: "/admin/tournament", icon: Settings2 },
  { label: "Player Pool", href: "/admin/players", icon: Users },
  { label: "Voting", href: "/admin/voting", icon: Vote },
  { label: "Accounts", href: "/admin/accounts", icon: KeyRound },
] as const;

const utility = [
  { label: "Checkpoints", href: "/admin/checkpoints", icon: RotateCcw },
  { label: "Audit", href: "/admin/audit", icon: History },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav({ role }: { role: "SUPERADMIN" | "ADMIN" }) {
  const pathname = usePathname();
  const visiblePrimary = role === "SUPERADMIN" ? primary : primary.filter((item) => item.href === "/admin");
  const visibleUtility = role === "SUPERADMIN" ? utility : [];
  return <nav aria-label="Admin navigation" className="admin-nav mb-6 border border-line bg-white shadow-panel">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
      <div className="flex items-center gap-2"><Activity size={15} className="text-court"/><span className="text-[10px] font-black uppercase tracking-[.18em] text-gray-500">Tournament operations</span></div>
      <span className="hidden text-[10px] font-bold uppercase tracking-[.16em] text-gray-400 lg:inline">Admin console</span>
    </div>
    <div className="flex gap-2 overflow-x-auto p-2 lg:justify-between">
      <div className="flex shrink-0 gap-2">
        {visiblePrimary.map(({ label, href, icon: Icon }) => {
          const active = isActive(pathname, href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 border px-3 py-2 text-xs font-black transition ${active ? "border-court bg-court text-white" : "border-line bg-white text-ink hover:border-court hover:text-court"}`}><Icon size={15}/>{label}</Link>;
        })}
      </div>
      <div className="flex shrink-0 gap-2">
        {visibleUtility.map(({ label, href, icon: Icon }) => {
          const active = isActive(pathname, href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 border px-3 py-2 text-xs font-black transition ${active ? "border-ink bg-ink text-white" : "border-line bg-paper text-gray-700 hover:border-court hover:text-court"}`}><Icon size={15}/>{label}</Link>;
        })}
      </div>
    </div>
  </nav>;
}
