export default function ScoreBadge({ home, away, status }: { home:number; away:number; status:string }) {
  const decided = status === "COMPLETED" || status === "FORFEITED";
  const homeWon = decided && home > away;
  const awayWon = decided && away > home;
  const scoreClass = (winner: boolean, loser: boolean) => winner
    ? "border-emerald-600 bg-emerald-600 text-white"
    : loser
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-ink bg-ink text-white";
  return <div className="flex items-center gap-1 text-sm font-black tabular-nums sm:gap-2 sm:text-base">
    <span className={`grid h-8 min-w-8 place-items-center border px-1.5 sm:h-9 sm:min-w-9 sm:px-2 ${scoreClass(homeWon, awayWon)}`}>{home}</span>
    <span className="text-gray-400">:</span>
    <span className={`grid h-8 min-w-8 place-items-center border px-1.5 sm:h-9 sm:min-w-9 sm:px-2 ${scoreClass(awayWon, homeWon)}`}>{away}</span>
  </div>;
}
