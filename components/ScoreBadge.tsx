export default function ScoreBadge({ home, away, status }: { home:number; away:number; status:string }) {
  return <div className="flex items-center gap-2 font-black tabular-nums">
    <span className="grid h-9 min-w-9 place-items-center bg-ink px-2 text-white">{home}</span>
    <span className="text-gray-400">:</span>
    <span className="grid h-9 min-w-9 place-items-center bg-ink px-2 text-white">{away}</span>
    {status === "LIVE" && <span className="ml-1 animate-pulse bg-red-100 px-2 py-1 text-[10px] uppercase tracking-widest text-red-700">Live</span>}
  </div>
}
