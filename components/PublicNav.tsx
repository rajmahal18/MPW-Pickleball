"use client";

import Link from "next/link";
import { Home, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type NavItem = { href: string; label: string; matches: (pathname: string) => boolean; icon?: LucideIcon };

const items: NavItem[] = [
  { href: "/", label: "Home", matches: (pathname: string) => pathname === "/", icon: Home },
  { href: "/format", label: "Format", matches: (pathname: string) => pathname.startsWith("/format") },
  { href: "/groups", label: "Groups", matches: (pathname: string) => pathname.startsWith("/groups") || pathname.startsWith("/teams/") },
  { href: "/bracket", label: "Bracket", matches: (pathname: string) => pathname.startsWith("/bracket") },
  { href: "/games", label: "Matches", matches: (pathname: string) => pathname.startsWith("/games") || pathname.startsWith("/matches/") },
  { href: "/players", label: "Players", matches: (pathname: string) => pathname.startsWith("/players") },
  { href: "/fan-favorite", label: "Fan Favorite", matches: (pathname: string) => pathname.startsWith("/fan-favorite") },
  { href: "/mvp", label: "MVP", matches: (pathname: string) => pathname.startsWith("/mvp") },
];

export default function PublicNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>("[aria-current='page']")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [pathname]);

  return <nav ref={navRef} aria-label="Tournament" className="order-3 col-span-2 mt-2 flex min-w-0 items-center gap-1 overflow-x-auto border-t border-line pt-2 text-xs font-bold [scrollbar-width:none] md:order-2 md:col-span-1 md:mt-0 md:w-auto md:flex-1 md:justify-center md:border-t-0 md:pt-0 md:text-sm">
    {items.map((item) => {
      const active = item.matches(pathname);
      const Icon = item.icon;
      return <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`relative inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-2 transition ${active ? "bg-flame/10 text-flame" : "text-ink hover:bg-paper hover:text-court"}`}
      >
        {Icon && <Icon size={15} aria-hidden="true" />}
        <span>{item.label}</span>
        {active && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 bg-flame" />}
      </Link>;
    })}
  </nav>;
}
