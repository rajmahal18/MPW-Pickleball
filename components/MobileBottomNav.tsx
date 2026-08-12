"use client";

import Link from "next/link";
import { Home, LayoutDashboard } from "lucide-react";
import { usePathname } from "next/navigation";

export default function MobileBottomNav({ dashboardHref }: { dashboardHref: "/admin" | "/leader" }) {
  const pathname = usePathname();
  const dashboardActive = pathname === dashboardHref || pathname.startsWith(`${dashboardHref}/`);

  return <nav
    aria-label="Signed-in quick navigation"
    className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 px-3 pt-2 shadow-2xl backdrop-blur md:hidden"
    style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
  >
    <div className="mx-auto grid max-w-sm grid-cols-2 gap-2">
      <Link
        href="/"
        aria-current={pathname === "/" ? "page" : undefined}
        className={`flex min-h-12 items-center justify-center gap-2 border px-3 py-2 text-xs font-black uppercase tracking-wide ${pathname === "/" ? "border-court bg-court text-white" : "border-line bg-white text-ink"}`}
      >
        <Home size={17} aria-hidden="true" />
        Home
      </Link>
      <Link
        href={dashboardHref}
        aria-current={dashboardActive ? "page" : undefined}
        className={`flex min-h-12 items-center justify-center gap-2 border px-3 py-2 text-xs font-black uppercase tracking-wide ${dashboardActive ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}
      >
        <LayoutDashboard size={17} aria-hidden="true" />
        Dashboard
      </Link>
    </div>
  </nav>;
}
