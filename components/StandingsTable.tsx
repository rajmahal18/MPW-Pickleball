import Link from "next/link";
import type { StandingRow } from "@/lib/tournament/standings";

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function pointTone(value: number) {
  if (value > 0) return "text-court";
  if (value < 0) return "text-flame";
  return "text-gray-500";
}

export default function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return <div className="w-full min-w-0">
    <table className="w-full table-fixed text-[10px] sm:text-xs lg:text-sm">
      <colgroup>
        <col className="w-7" />
        <col />
        <col className="w-14 sm:w-16" />
        <col className="w-7" />
        <col className="w-7" />
        <col className="w-11 sm:w-14" />
        <col className="w-11 sm:w-14" />
      </colgroup>
      <thead className="bg-ink text-left text-[8px] uppercase text-white sm:text-[10px]">
        <tr>
          <th className="px-1.5 py-2">#</th>
          <th className="px-1.5 py-2">Team</th>
          <th className="px-1 py-2 text-center" title="Total decided pair matches played">Matches</th>
          <th className="px-1 py-2 text-center" title="Total pair-match wins">W</th>
          <th className="px-1 py-2 text-center" title="Total pair-match losses">L</th>
          <th className="px-1 py-2 text-center" title="Net Point Differential: total points scored minus total points conceded across decided pair matches">NPD</th>
          <th className="px-1 py-2 text-center" title="Total points scored across decided pair matches">TP</th>
        </tr>
      </thead>
      <tbody>{rows.map((row) => <tr key={row.team.id} className="border-b border-line align-top last:border-0">
        <td className="px-1.5 py-3 font-black">{row.rankLabel || row.rank}</td>
        <td className="min-w-0 px-1.5 py-3">
          <Link className="block overflow-hidden text-ellipsis whitespace-normal font-bold leading-snug hover:text-court" href={`/teams/${row.team.id}`} title={row.team.name}>{row.team.name}</Link>
          {(row.rankStatus === "TIED" || row.tiebreakApplied) && <div className="mt-1 flex flex-wrap gap-1">
            {row.rankStatus === "TIED" && <span className="border border-amber-300 bg-amber-50 px-1 py-0.5 text-[8px] font-black uppercase text-amber-950 sm:text-[9px]">Tie</span>}
            {row.tiebreakApplied && <span className="border border-court/30 bg-court/10 px-1 py-0.5 text-[8px] font-black uppercase text-court sm:text-[9px]">Tiebreak</span>}
          </div>}
        </td>
        <td className="px-1 py-3 text-center tabular-nums">{row.played}</td>
        <td className="px-1 py-3 text-center tabular-nums">{row.won}</td>
        <td className="px-1 py-3 text-center tabular-nums">{row.lost}</td>
        <td className={`px-1 py-3 text-center font-black tabular-nums ${pointTone(row.points)}`}>{signed(row.points)}</td>
        <td className="px-1 py-3 text-center font-black tabular-nums">{row.totalPointsScored}</td>
      </tr>)}</tbody>
    </table>
    <div className="border-t border-line bg-gray-50 px-3 py-2 text-[9px] font-bold leading-relaxed text-gray-500 sm:text-[10px]">
      <span className="sm:hidden">TB: pair-match wins → NPD → H2H → total points.</span>
      <span className="hidden sm:inline">Tiebreak order: total pair-match wins, Net Point Differential, head-to-head result, then total points scored.</span>
    </div>
  </div>;
}
