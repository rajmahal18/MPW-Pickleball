import Link from "next/link";
import LiveGameCard from "@/components/LiveGameCard";
import StandingsTable from "@/components/StandingsTable";
import { prisma } from "@/lib/prisma";
import { computeStandings } from "@/lib/standings";

export const dynamic = "force-dynamic";
export default async function Home(){
  const tournament=await prisma.tournament.findFirst({include:{groups:{include:{teams:{include:{group:true}}}},matchups:{where:{stage:"GROUP"},orderBy:{order:"asc"}}}});
  if(!tournament)return <main className="mx-auto max-w-7xl p-6">Run the seed script first.</main>;
  const live=await prisma.game.findMany({where:{status:"LIVE"},include:{matchup:true,homeTeam:true,awayTeam:true,homePair:{include:{playerA:true,playerB:true}},awayPair:{include:{playerA:true,playerB:true}}},orderBy:{startedAt:"asc"}});
  return <main>
    <section className="border-b border-line bg-ink text-white"><div className="mx-auto max-w-7xl px-4 py-12"><div className="label text-lime">Official tournament hub</div><h1 className="mt-2 max-w-4xl text-4xl font-black uppercase leading-none md:text-6xl">{tournament.name}</h1><p className="mt-4 max-w-2xl text-white/70">3 groups. 12 teams. 84 pairs. Every game, lineup, player and score visible in one public Liquipedia-inspired hub.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/bracket" className="btn bg-lime border-lime text-ink">View bracket</Link><Link href="/groups/a" className="btn border-white/30 text-white">Group stage</Link></div></div></section>
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8">
      <section><div className="mb-4 flex items-end justify-between"><div><div className="label">Now playing</div><h2 className="text-2xl font-black uppercase">Live courts</h2></div><span className="bg-red-100 px-3 py-1 text-xs font-bold text-red-700">{live.length} live</span></div>{live.length?<div className="grid gap-4 lg:grid-cols-2">{live.map(g=><LiveGameCard key={g.id} initial={g}/>)}</div>:<div className="panel p-8 text-center text-gray-500">No game is live right now. Upcoming matchups are listed below.</div>}</section>
      <section><div className="mb-4"><div className="label">Road to the semifinals</div><h2 className="text-2xl font-black uppercase">Group standings</h2></div><div className="grid gap-5 lg:grid-cols-3">{tournament.groups.map(group=>{const rows=computeStandings(group.teams,tournament.matchups.filter(m=>m.groupLabel===group.name));return <div className="panel" key={group.id}><div className="flex items-center justify-between border-b border-line p-4"><h3 className="font-black uppercase">{group.name}</h3><Link href={`/groups/${group.slug}`} className="text-xs font-bold text-court">Full group →</Link></div><StandingsTable rows={rows}/></div>})}</div></section>
      <section><div className="mb-4"><div className="label">Complete transparency</div><h2 className="text-2xl font-black uppercase">All group matchups</h2></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{tournament.matchups.slice(0,18).map(m=><Link href={`/matches/${m.id}`} className="panel p-4 hover:border-court" key={m.id}><div className="flex justify-between"><span className="label">{m.groupLabel} · {m.roundLabel}</span><span className="text-xs font-bold">{m.status.replaceAll("_"," ")}</span></div><div className="mt-3 flex items-center justify-between font-black"><span>{m.homeTeamId?groupTeam(tournament,m.homeTeamId):"TBD"}</span><span className="text-gray-400">vs</span><span>{m.awayTeamId?groupTeam(tournament,m.awayTeamId):"TBD"}</span></div></Link>)}</div></section>
    </div>
  </main>
}
function groupTeam(t:any,id:string){for(const g of t.groups){const team=g.teams.find((x:any)=>x.id===id);if(team)return team.shortName}return "TBD"}
