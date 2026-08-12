import Link from "next/link";
import type { StandingRow } from "@/lib/tournament/standings";

function diff(value: number) {
  return value > 0 ? `+${value}` : value;
}

function pointTone(value: number) {
  if (value > 0) return "text-court";
  if (value < 0) return "text-flame";
  return "text-gray-500";
}

export default function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return <div className="w-full min-w-0">
    <table className="w-full table-fixed text-[11px] sm:text-xs lg:text-sm">
      <colgroup>
        <col className="w-7" />
        <col />
        <col className="w-7" />
        <col className="w-7" />
        <col className="w-7" />
        <col className="w-12" />
        <col className="w-10" />
        <col className="w-10" />
      </colgroup>
      <thead className="bg-ink text-left text-[9px] uppercase text-white sm:text-[10px]">
        <tr>
          <th className="px-1.5 py-2">#</th>
          <th className="px-1.5 py-2">Team</th>
          <th className="px-1 py-2 text-center">P</th>
          <th className="px-1 py-2 text-center">W</th>
          <th className="px-1 py-2 text-center">L</th>
          <th className="px-1 py-2 text-center">Games</th>
          <th className="px-1 py-2 text-center">Diff</th>
          <th className="px-1 py-2 text-center" title="Scoring point differential: total points scored minus total points conceded in decided pair games.">Pts</th>
        </tr>
      </thead>
      <tbody>{rows.map((row) => <tr key={row.team.id} className="border-b border-line align-top last:border-0">
        <td className="px-1.5 py-3 font-black">{row.rankLabel || row.rank}</td>
        <td className="min-w-0 px-1.5 py-3">
          <Link className="block whitespace-normal font-bold leading-snug hover:text-court" href={`/teams/${row.team.id}`} title={row.team.name}>{row.team.name}</Link>
          {(row.rankStatus === "TIED" || row.tiebreakApplied) && <div className="mt-1 flex flex-wrap gap-1">
            {row.rankStatus === "TIED" && <span className="border border-amber-300 bg-amber-50 px-1 py-0.5 text-[8px] font-black uppercase text-amber-950 sm:text-[9px]">Tie</span>}
            {row.tiebreakApplied && <span className="border border-court/30 bg-court/10 px-1 py-0.5 text-[8px] font-black uppercase text-court sm:text-[9px]">Tiebreak</span>}
          </div>}
        </td>
        <td className="px-1 py-3 text-center tabular-nums">{row.played}</td>
        <td className="px-1 py-3 text-center tabular-nums">{row.won}</td>
        <td className="px-1 py-3 text-center tabular-nums">{row.lost}</td>
        <td className="px-1 py-3 text-center tabular-nums">{row.gameWins}-{row.gameLosses}</td>
        <td className="px-1 py-3 text-center tabular-nums">{diff(row.differential)}</td>
        <td className={`px-1 py-3 text-center font-black tabular-nums ${pointTone(row.points)}`}>{diff(row.points)}</td>
      </tr>)}</tbody>
    </table>
    <div className="border-t border-line bg-gray-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-gray-500">Pts = scoring point differential (points scored minus points conceded) from decided pair games. Games, Diff, and Pts update after each decided game; P/W/L become final only when the full team matchup is completed.</div>
  </div>;
}
