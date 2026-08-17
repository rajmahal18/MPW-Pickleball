export function TournamentPosterBrand({ compact = false }: { compact?: boolean }) {
  return <div className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-black/15 pr-3 backdrop-blur-sm">
    <span className={`${compact ? "h-9 w-9" : "h-11 w-11"} grid shrink-0 place-items-center rounded-full bg-white p-1 shadow-sm`}><img src="/favicon.png" alt="MPW BARMM" className="h-full w-full object-contain"/></span>
    <span className="min-w-0 py-1.5 leading-none"><strong className={`${compact ? "text-[10px]" : "text-xs"} block whitespace-nowrap font-black uppercase tracking-[.08em] text-white`}>MPW Dink & Dash</strong><span className="mt-1 block whitespace-nowrap text-[8px] font-bold uppercase tracking-[.12em] text-white/60">Pickleball Tournament</span></span>
  </div>;
}

export function PickleballPosterDecor({ side = "right" }: { side?: "left" | "right" }) {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    <div className={`poster-court-lines ${side === "left" ? "poster-court-lines-left" : "poster-court-lines-right"}`}/>
    <div className={`poster-pickleball-ball ${side === "left" ? "poster-pickleball-ball-left" : "poster-pickleball-ball-right"}`}/>
  </div>;
}
