"use client";

import { Eye, EyeOff } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

export default function PublicPreviewBanner({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname.startsWith("/admin") || pathname.startsWith("/leader")) return null;
  const returnTo = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
  return <div className={`border-b px-4 py-2 ${enabled ? "border-amber-300 bg-amber-50 text-amber-950" : "border-line bg-sky-50 text-ink"}`}>
    <form action="/api/admin/public-preview" method="post" className="mx-auto flex max-w-7xl items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2 text-xs font-bold md:text-sm">
        {enabled ? <Eye size={16} className="shrink-0"/> : <EyeOff size={16} className="shrink-0"/>}
        <span>{enabled ? "Superadmin preview: private divisions are visible only to you." : "Public view: you see exactly what visitors see."}</span>
      </div>
      <input type="hidden" name="enabled" value={enabled ? "0" : "1"}/>
      <input type="hidden" name="returnTo" value={returnTo}/>
      <button type="submit" className="btn-ghost min-h-9 shrink-0 rounded-lg px-3 py-1.5 text-[11px] md:text-xs">{enabled ? "Exit preview" : "Preview private"}</button>
    </form>
  </div>;
}
