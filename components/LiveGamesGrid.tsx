"use client";

import { useEffect, useState } from "react";
import LiveGameCard, { type LiveGame } from "@/components/LiveGameCard";
import { PUBLIC_POLL_INTERVAL_MS, PUBLIC_POLL_JITTER_RATIO } from "@/lib/tournament/config";

export default function LiveGamesGrid({ initial }: { initial: LiveGame[] }) {
  const [games, setGames] = useState(initial);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let stopped = false;
    let loading = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (baseDelay = PUBLIC_POLL_INTERVAL_MS) => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      const jitter = baseDelay * PUBLIC_POLL_JITTER_RATIO * (Math.random() * 2 - 1);
      timer = setTimeout(load, Math.max(1500, Math.round(baseDelay + jitter)));
    };

    const load = async () => {
      if (stopped || loading) return;
      if (timer) clearTimeout(timer);
      timer = null;
      if (document.visibilityState !== "visible") {
        schedule(PUBLIC_POLL_INTERVAL_MS * 2);
        return;
      }
      loading = true;
      try {
        const response = await fetch("/api/public/live-games", { cache: "no-store" });
        if (!response.ok) throw new Error("Live matches refresh failed.");
        const next = await response.json() as LiveGame[];
        if (!stopped) {
          setGames(next);
          setStale(false);
        }
      } catch {
        if (!stopped) setStale(true);
      } finally {
        loading = false;
        schedule();
      }
    };

    schedule();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return <section>
    <div className="mb-4 flex items-end justify-between gap-3"><div><div className="label">Now playing</div><h2 className="text-2xl font-black uppercase">Live courts</h2></div><div className="flex items-center gap-2"><span className="bg-flame/10 px-3 py-1 text-xs font-bold text-flame">{games.length} live</span>{stale && <span className="text-xs font-bold text-amber-700">Reconnecting…</span>}</div></div>
    {games.length ? <div className="grid gap-4 lg:grid-cols-2">{games.map((game) => <LiveGameCard key={game.id} game={game}/>)}</div> : <div className="panel p-8 text-center text-gray-500">No match is live right now. Upcoming matchups are below.</div>}
  </section>;
}
