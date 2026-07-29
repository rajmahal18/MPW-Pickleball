"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh({ interval = 5000 }: { interval?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), interval);
    return () => window.clearInterval(timer);
  }, [interval, router]);
  return null;
}
