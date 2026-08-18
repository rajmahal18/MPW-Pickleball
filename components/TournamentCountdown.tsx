"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, LogIn } from "lucide-react";

type CountdownParts = { days: number; hours: number; minutes: number; seconds: number; total: number };

function remaining(targetMs: number, nowMs: number): CountdownParts {
  const total = Math.max(0, targetMs - nowMs);
  const secondsTotal = Math.floor(total / 1000);
  return {
    total,
    days: Math.floor(secondsTotal / 86400),
    hours: Math.floor((secondsTotal % 86400) / 3600),
    minutes: Math.floor((secondsTotal % 3600) / 60),
    seconds: secondsTotal % 60,
  };
}

function Unit({ value, label }: { value: number; label: string }) {
  return <div className="min-w-0 rounded-2xl border border-white/15 bg-white/10 px-2 py-4 text-center backdrop-blur-sm sm:px-4 sm:py-5">
    <div className="text-3xl font-black tabular-nums text-white sm:text-5xl">{String(value).padStart(2, "0")}</div>
    <div className="mt-1 text-[9px] font-black uppercase tracking-[.18em] text-white/55 sm:text-[10px]">{label}</div>
  </div>;
}

export default function TournamentCountdown({ launchAt, serverNow }: { launchAt: string; serverNow: number }) {
  const targetMs = useMemo(() => Date.parse(launchAt), [launchAt]);
  const [clockBase] = useState(() => ({ serverNow, performanceNow: performance.now() }));
  const [parts, setParts] = useState(() => remaining(targetMs, serverNow));

  useEffect(() => {
    const tick = () => {
      const synchronizedNow = clockBase.serverNow + (performance.now() - clockBase.performanceNow);
      const next = remaining(targetMs, synchronizedNow);
      setParts(next);
      if (next.total <= 0) window.location.replace("/");
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [clockBase, targetMs]);

  const launchLabel = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(targetMs));

  return <main className="fixed inset-0 z-[100] overflow-y-auto bg-ink text-white">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(31,111,178,.35),transparent_32%),radial-gradient(circle_at_82%_72%,rgba(244,177,31,.18),transparent_30%)]" aria-hidden="true"/>
    <div className="relative mx-auto flex min-h-full max-w-5xl items-center px-4 py-10 sm:px-6">
      <section className="w-full text-center">
        <img src="/favicon.png" alt="MPW Pickleball" className="mx-auto h-16 w-16 object-contain sm:h-20 sm:w-20"/>
        <div className="mt-5 text-[10px] font-black uppercase tracking-[.24em] text-gold sm:text-xs">MPW Dink & Dash 2026</div>
        <h1 className="mx-auto mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl md:text-6xl">Tournament site opens in</h1>
        <div className="mx-auto mt-7 grid max-w-3xl grid-cols-4 gap-2 sm:mt-9 sm:gap-4">
          <Unit value={parts.days} label="Days"/>
          <Unit value={parts.hours} label="Hours"/>
          <Unit value={parts.minutes} label="Minutes"/>
          <Unit value={parts.seconds} label="Seconds"/>
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-white/60 sm:text-sm"><CalendarDays className="h-4 w-4"/><span>Public access: {launchLabel} (Philippine time)</span></div>
        <div className="mx-auto mt-8 max-w-md border-t border-white/10 pt-6">
          <p className="text-sm text-white/55">Tournament staff and team managers can sign in for early access.</p>
          <Link href="/login" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white px-5 py-3 text-sm font-black text-ink transition hover:bg-gold"><LogIn className="h-4 w-4"/>Authorized login</Link>
        </div>
      </section>
    </div>
  </main>;
}
