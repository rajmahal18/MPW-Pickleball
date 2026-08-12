"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function TournamentSync({ initialRevision, interval = 2500 }: { initialRevision: string; interval?: number }) {
  const router = useRouter();
  const revisionRef = useRef(initialRevision);

  useEffect(() => {
    revisionRef.current = initialRevision;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const schedule = (delay = interval) => {
      if (stopped) return;
      clearTimer();
      timer = setTimeout(check, delay);
    };

    const check = async () => {
      if (stopped) return;
      clearTimer();
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }
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
