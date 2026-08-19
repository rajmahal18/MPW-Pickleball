import Link from "next/link";
import type { QualificationOutcome, StandingRow } from "@/lib/tournament/standings";
import { TeamLogo } from "@/components/TeamIdentity";

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function pointTone(value: number) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-gray-500";
}

function rowTone(outcome?: QualificationOutcome) {
  if (outcome === "QUALIFIED") return "bg-emerald-50/90 hover:bg-emerald-100/80";
  if (outcome === "ELIMINATED") return "bg-red-50/80 text-red-950 hover:bg-red-100/70";
  if (outcome === "PENDING") return "bg-amber-50/80 hover:bg-amber-100/70";
  return "hover:bg-gray-50/80";
}

export default function StandingsTable({ rows, qualificationByTeam }: { rows: StandingRow[]; qualificationByTeam?: Map<string, QualificationOutcome> }) {
  const hasQualificationState = Boolean(qualificationByTeam?.size);
  return <div className="w-full min-w-0">
    {hasQualificationState && <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-500 sm:text-[10px]">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-emerald-500"/> Through</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-red-500"/> Eliminated</span>
      {[...qualificationByTeam!.values()].includes("PENDING") && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-amber-400"/> Tiebreak pending</span>}
    </div>}
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
      <tbody>{rows.map((row) => {
        const outcome = qualificationByTeam?.get(row.team.id);
        return <tr key={row.team.id} className={`border-b border-line align-top transition-colors last:border-0 ${rowTone(outcome)}`}>
          <td className={`px-1.5 py-3 font-black ${outcome === "QUALIFIED" ? "text-emerald-800" : outcome === "ELIMINATED" ? "text-red-800" : ""}`}>{row.rankLabel || row.rank}</td>
          <td className="min-w-0 px-1.5 py-3">
            <Link className={`flex min-w-0 items-center gap-1.5 font-bold leading-snug ${outcome === "QUALIFIED" ? "text-emerald-950 hover:text-emerald-700" : outcome === "ELIMINATED" ? "text-red-950 hover:text-red-700" : "hover:text-court"}`} href={`/teams/${row.team.id}`} title={row.team.name}><TeamLogo team={row.team} size="xs"/><span className="min-w-0 overflow-hidden text-ellipsis whitespace-normal">{row.team.name}</span></Link>
            <div className="mt-1 flex flex-wrap gap-1">
              {outcome === "PENDING" && <span className="border border-amber-300 bg-amber-100 px-1 py-0.5 text-[8px] font-black uppercase text-amber-900 sm:text-[9px]">Tiebreak pending</span>}
              {row.rankStatus === "TIED" && <span className="border border-amber-300 bg-amber-50 px-1 py-0.5 text-[8px] font-black uppercase text-amber-950 sm:text-[9px]">Tie</span>}
              {row.tiebreakApplied && <span className="border border-court/30 bg-court/10 px-1 py-0.5 text-[8px] font-black uppercase text-court sm:text-[9px]">Tiebreak</span>}
            </div>
          </td>
          <td className="px-1 py-3 text-center tabular-nums">{row.played}</td>
          <td className="px-1 py-3 text-center font-black tabular-nums text-emerald-700">{row.won}</td>
          <td className="px-1 py-3 text-center font-black tabular-nums text-red-700">{row.lost}</td>
          <td className={`px-1 py-3 text-center font-black tabular-nums ${pointTone(row.points)}`}>{signed(row.points)}</td>
          <td className="px-1 py-3 text-center font-black tabular-nums">{row.totalPointsScored}</td>
        </tr>;
      })}</tbody>
    </table>
    <div className="border-t border-line bg-gray-50 px-3 py-2 text-[9px] font-bold leading-relaxed text-gray-500 sm:text-[10px]">
      <span className="sm:hidden">TB: pair-match wins → NPD → total points → H2H.</span>
      <span className="hidden sm:inline">Tiebreak order: total pair-match wins, Net Point Differential, total points scored, then head-to-head result.</span>
    </div>
  </div>;
}
