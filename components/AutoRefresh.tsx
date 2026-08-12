"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh({ interval = 5000 }: { interval?: number }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      if (!stopped && document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, interval);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [interval, router]);
  return null;
}
