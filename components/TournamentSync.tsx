"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PUBLIC_POLL_INTERVAL_MS, PUBLIC_POLL_JITTER_RATIO } from "@/lib/tournament/config";

export default function TournamentSync({ initialRevision, interval = PUBLIC_POLL_INTERVAL_MS }: { initialRevision: string; interval?: number }) {
  const router = useRouter();
  const revisionRef = useRef(initialRevision);

  useEffect(() => {
    revisionRef.current = initialRevision;
    let stopped = false;
    let checking = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const schedule = (baseDelay = interval) => {
      if (stopped) return;
      clearTimer();
      const jitter = baseDelay * PUBLIC_POLL_JITTER_RATIO * (Math.random() * 2 - 1);
      timer = setTimeout(check, Math.max(1500, Math.round(baseDelay + jitter)));
    };

    const check = async () => {
      if (stopped || checking) return;
      clearTimer();
      if (document.visibilityState !== "visible") {
        schedule(interval * 2);
        return;
      }
      checking = true;
      try {
        const response = await fetch("/api/public/tournament-revision", { cache: "no-store" });
        if (!response.ok) throw new Error("Tournament revision refresh failed.");
        const payload = await response.json() as { revision?: string };
        if (payload.revision && payload.revision !== revisionRef.current) {
          revisionRef.current = payload.revision;
          router.refresh();
        }
      } catch {
        // Keep the current screen usable. The next poll/focus event retries automatically.
      } finally {
        checking = false;
        schedule();
      }
    };

    schedule();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      clearTimer();
      window.removeEventListener("focus", onFocus);
    };
  }, [initialRevision, interval, router]);

  return null;
}
