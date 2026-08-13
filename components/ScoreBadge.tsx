export default function ScoreBadge({ home, away, status }: { home:number; away:number; status:string }) {
  const decided = status === "COMPLETED" || status === "FORFEITED";
  const homeWon = decided && home > away;
  const awayWon = decided && away > home;
  const scoreClass = (winner: boolean, loser: boolean) => winner
    ? "border-emerald-600 bg-emerald-600 text-white"
    : loser
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-ink bg-ink text-white";
  return <div className="flex items-center gap-2 font-black tabular-nums">
    <span className={`grid h-9 min-w-9 place-items-center border px-2 ${scoreClass(homeWon, awayWon)}`}>{home}</span>
    <span className="text-gray-400">:</span>
    <span className={`grid h-9 min-w-9 place-items-center border px-2 ${scoreClass(awayWon, homeWon)}`}>{away}</span>
    {status === "LIVE" && <span className="ml-1 animate-pulse rounded-full bg-flame/10 px-2 py-1 text-[10px] uppercase tracking-widest text-flame">Live</span>}
  </div>;
}
