"use client";

import Link from "next/link";
import { ChevronDown, Home, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavItem = { href: string; label: string; matches: (pathname: string) => boolean; icon?: LucideIcon };

const primaryItems: NavItem[] = [
  { href: "/", label: "Home", matches: (pathname) => pathname === "/", icon: Home },
  { href: "/games", label: "Matches", matches: (pathname) => pathname.startsWith("/games") || pathname.startsWith("/matches/") },
  { href: "/groups", label: "Groups", matches: (pathname) => pathname.startsWith("/groups") },
  { href: "/teams", label: "Teams", matches: (pathname) => pathname.startsWith("/teams") },
  { href: "/players", label: "Players", matches: (pathname) => pathname.startsWith("/players") },
  { href: "/bracket", label: "Bracket", matches: (pathname) => pathname.startsWith("/bracket") },
];

const moreItems: NavItem[] = [
  { href: "/format", label: "Format", matches: (pathname) => pathname.startsWith("/format") },
  { href: "/fan-favorite", label: "Fan Favorite", matches: (pathname) => pathname.startsWith("/fan-favorite") },
  { href: "/mvp", label: "MVP", matches: (pathname) => pathname.startsWith("/mvp") },
];

function NavLink({ item, pathname, onClick, menu = false }: { item: NavItem; pathname: string; onClick?: () => void; menu?: boolean }) {
  const active = item.matches(pathname);
  const Icon = item.icon;
  return <Link
    href={item.href}
    onClick={onClick}
    role={menu ? "menuitem" : undefined}
    aria-current={active ? "page" : undefined}
    className={`relative min-h-10 items-center gap-1.5 whitespace-nowrap px-2.5 py-2 transition ${menu ? "flex w-full rounded-lg" : "inline-flex shrink-0"} ${active ? "bg-flame/10 text-flame" : "text-ink hover:bg-paper hover:text-court"}`}
  >
    {Icon && <Icon size={15} aria-hidden="true"/>}
    <span>{item.label}</span>
    {active && !menu && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 bg-flame"/>}
  </Link>;
}

function MoreButton({ open, active, className = "", onClick }: { open: boolean; active: boolean; className?: string; onClick: () => void }) {
  return <button
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    onClick={onClick}
    className={`relative inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap px-2.5 py-2 font-bold transition ${active ? "bg-flame/10 text-flame" : "text-ink hover:bg-paper hover:text-court"} ${className}`}
  >
    More <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}/>
    {active && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 bg-flame"/>}
  </button>;
}

function MoreMenu({ pathname, close, className = "" }: { pathname: string; close: () => void; className?: string }) {
  return <div role="menu" className={`z-50 w-52 overflow-hidden rounded-xl border border-line bg-white p-1.5 text-sm font-bold shadow-xl ${className}`}>
    {moreItems.map((item) => <div role="none" key={item.href}><NavLink item={item} pathname={pathname} menu onClick={close}/></div>)}
  </div>;
}

export default function PublicNav() {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreItems.some((item) => item.matches(pathname));
  const closeMore = () => setMoreOpen(false);

  useEffect(() => {
    setMoreOpen(false);
    navRef.current?.querySelector<HTMLElement>("[aria-current='page']")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [pathname]);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, []);

  return <div ref={rootRef} className="relative order-3 col-span-2 mt-2 min-w-0 border-t border-line pt-2 md:order-2 md:col-span-1 md:mt-0 md:flex-1 md:border-t-0 md:pt-0">
    <nav ref={navRef} aria-label="Tournament" className="flex min-w-0 items-center gap-1 overflow-x-auto text-xs font-bold [scrollbar-width:none] md:justify-center md:overflow-visible md:text-sm">
      {primaryItems.map((item) => <NavLink key={item.href} item={item} pathname={pathname}/>)}

      {/* Keep the existing mobile menu placement; desktop gets its own trigger-relative anchor. */}
      <MoreButton open={moreOpen} active={moreActive} onClick={() => setMoreOpen((open) => !open)} className="md:hidden"/>
      <div className="relative hidden shrink-0 md:block">
        <MoreButton open={moreOpen} active={moreActive} onClick={() => setMoreOpen((open) => !open)}/>
        {moreOpen && <MoreMenu pathname={pathname} close={closeMore} className="absolute left-0 top-full mt-2"/>}
      </div>
    </nav>

    {moreOpen && <MoreMenu pathname={pathname} close={closeMore} className="absolute right-0 top-full mt-2 md:hidden"/>}
  </div>;
}
