import Link from "next/link";
export default function StandingsTable({ rows }: { rows:any[] }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead className="bg-ink text-left text-[11px] uppercase tracking-widest text-white"><tr><th className="p-3">#</th><th className="p-3">Team</th><th className="p-3">P</th><th className="p-3">W</th><th className="p-3">L</th><th className="p-3">Games</th><th className="p-3">Diff</th><th className="p-3">Pts</th></tr></thead>
    <tbody>{rows.map((r,i)=><tr key={r.team.id} className="border-b border-line last:border-0"><td className="p-3 font-black">{i+1}</td><td className="p-3"><Link className="font-bold hover:text-court" href={`/teams/${r.team.id}`}>{r.team.name}</Link></td><td className="p-3">{r.played}</td><td className="p-3">{r.won}</td><td className="p-3">{r.lost}</td><td className="p-3">{r.gameWins}-{r.gameLosses}</td><td className="p-3">{r.differential>0?`+${r.differential}`:r.differential}</td><td className="p-3 font-black text-court">{r.points}</td></tr>)}</tbody>
  </table></div>
}
