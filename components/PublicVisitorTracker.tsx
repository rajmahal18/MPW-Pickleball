"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export default function PublicVisitorTracker() {
  const pathname = usePathname();
  const lastTracked = useRef("");

  useEffect(() => {
    if (!pathname || pathname === lastTracked.current) return;
    if (pathname === "/login" || pathname.startsWith("/admin") || pathname.startsWith("/leader") || pathname.startsWith("/api")) return;
    lastTracked.current = pathname;

    let referrerHost: string | null = null;
    if (document.referrer) {
      try { referrerHost = new URL(document.referrer).hostname; } catch { referrerHost = null; }
    }

    void fetch("/api/public/analytics/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, referrerHost }),
      cache: "no-store",
      keepalive: true,
    }).catch(() => {
      // Analytics must never interfere with the public experience.
    });
  }, [pathname]);

  return null;
}
