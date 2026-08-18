"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Radio } from "lucide-react";

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
  return <div className="min-w-0 rounded-xl border border-white/15 bg-white/10 px-2 py-3 text-center backdrop-blur-sm sm:px-4 sm:py-4">
    <div className="text-2xl font-black tabular-nums text-white sm:text-4xl">{String(value).padStart(2, "0")}</div>
    <div className="mt-1 text-[8px] font-black uppercase tracking-[.16em] text-white/55 sm:text-[9px]">{label}</div>
  </div>;
}

export default function TournamentCountdown({ launchAt, serverNow, onComplete }: { launchAt: string; serverNow: number; onComplete?: () => void }) {
  const targetMs = useMemo(() => Date.parse(launchAt), [launchAt]);
  const [clockBase] = useState(() => ({ serverNow, performanceNow: performance.now() }));
  const [parts, setParts] = useState(() => remaining(targetMs, serverNow));

  useEffect(() => {
    const tick = () => {
      const synchronizedNow = clockBase.serverNow + (performance.now() - clockBase.performanceNow);
      const next = remaining(targetMs, synchronizedNow);
      setParts(next);
      if (next.total <= 0) onComplete?.();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [clockBase, onComplete, targetMs]);

  const launchLabel = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(targetMs));

  return <div className="relative overflow-hidden rounded-2xl bg-ink p-5 text-white shadow-panel sm:p-7">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(31,111,178,.38),transparent_34%),radial-gradient(circle_at_85%_85%,rgba(244,177,31,.16),transparent_30%)]" aria-hidden="true"/>
    <div className="relative grid gap-5 lg:grid-cols-[minmax(0,.85fr)_minmax(420px,1.15fr)] lg:items-center">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[9px] font-black uppercase tracking-[.18em] text-gold"><Radio className="h-3.5 w-3.5"/> Live courts open soon</div>
        <h3 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Tournament starts in</h3>
        <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">No match is live yet. If organizers start a match early for testing or actual play, the live scoreboard automatically takes priority over this countdown.</p>
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-white/55"><CalendarDays className="h-4 w-4"/><span>{launchLabel} · Philippine time</span></div>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <Unit value={parts.days} label="Days"/>
        <Unit value={parts.hours} label="Hours"/>
        <Unit value={parts.minutes} label="Minutes"/>
        <Unit value={parts.seconds} label="Seconds"/>
      </div>
    </div>
  </div>;
}
