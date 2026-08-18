import Link from "next/link";

export type EventTabDivision = {
  id: string;
  name: string;
  slug: string;
  entrantType?: string;
};

export default function EventTabs({ divisions, activeId, basePath, preserve = {} }: {
  divisions: EventTabDivision[];
  activeId: string;
  basePath: string;
  preserve?: Record<string, string | undefined>;
}) {
  if (divisions.length <= 1) return null;
  return <nav className="mt-3 flex gap-2 overflow-x-auto rounded-xl border border-line bg-white p-2 shadow-sm md:mt-5" aria-label="Tournament events">
    {divisions.map((division) => {
      const params = new URLSearchParams();
      params.set("division", division.slug);
      for (const [key, value] of Object.entries(preserve)) if (value) params.set(key, value);
      const active = division.id === activeId;
      return <Link key={division.id} href={`${basePath}?${params.toString()}`} className={`min-h-10 shrink-0 rounded-lg px-3.5 py-2.5 text-xs font-black uppercase transition md:text-sm ${active ? "bg-ink text-white shadow-sm" : "bg-paper text-gray-600 hover:bg-court/10 hover:text-court"}`}>{division.name}</Link>;
    })}
  </nav>;
}
