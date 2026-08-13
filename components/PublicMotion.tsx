"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TARGET_SELECTOR = [
  "main.public-page > section",
  "main.public-page > article",
  "main.public-page > div > section",
  "main.public-page > div > article",
  "main.public-page [data-motion-reveal]",
].join(",");

export default function PublicMotion() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/leader") || pathname === "/login") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(document.querySelectorAll<HTMLElement>(TARGET_SELECTOR));
    if (!targets.length) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target as HTMLElement;
        target.classList.add("public-motion-visible");
        observer.unobserve(target);
      }
    }, { rootMargin: "0px 0px -7% 0px", threshold: 0.06 });

    targets.forEach((target, index) => {
      target.classList.add("public-motion-reveal");
      target.style.setProperty("--public-motion-delay", `${Math.min(index, 4) * 35}ms`);
      const rect = target.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92) target.classList.add("public-motion-visible");
      else observer.observe(target);
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
