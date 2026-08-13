import Link from "next/link";
import type { ReactNode } from "react";
import { Crown, Heart, Sparkles, Trophy } from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";
import { formatPlayerCompactName, formatPlayerDisplayName } from "@/lib/player-name";
import type { MvpRow } from "@/lib/tournament/mvp";

type PosterPlayer = {
  id: string;
  firstName: string;
  middleInitial?: string | null;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
};

type FanLeader = {
  row: { _count: { _all: number } };
  player: PosterPlayer & { team: { shortName: string } | null };
};

export default function ChampionCelebrationPoster({
  divisionName,
  team,
  players,
  maleMvp,
  femaleMvp,
  maleFan,
  femaleFan,
}: {
  divisionName: string;
  team: { id: string; name: string; shortName: string; logoUrl: string | null };
  players: PosterPlayer[];
  maleMvp?: MvpRow;
  femaleMvp?: MvpRow;
  maleFan?: FanLeader;
  femaleFan?: FanLeader;
}) {
  return <section className="relative overflow-hidden rounded-3xl border border-gold/40 bg-ink text-white shadow-panel">
    <div className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(circle at 18% 20%, rgba(244,177,31,.28), transparent 28%), radial-gradient(circle at 83% 42%, rgba(31,111,178,.33), transparent 34%), linear-gradient(135deg,#07152f 0%,#061127 50%,#020814 100%)" }}/>
    <div className="absolute -left-16 top-10 h-48 w-48 rounded-full border-[26px] border-gold/10"/>
    <div className="absolute -right-16 -top-10 h-56 w-56 rotate-12 rounded-[38%] border-[22px] border-court/10"/>

    <div className="relative z-10 px-4 py-5 md:px-7 md:py-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.2em] text-gold"><Sparkles className="h-3.5 w-3.5"/> Congratulations</div>
          <div className="mt-3 flex items-center gap-3">
            {team.logoUrl ? <img src={team.logoUrl} alt="" className="h-14 w-14 shrink-0 object-contain md:h-16 md:w-16"/> : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold/10 text-sm font-black text-gold md:h-16 md:w-16">{team.shortName.slice(0, 3)}</div>}
            <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[.18em] text-white/55">{divisionName} champion</div><h2 className="mt-1 text-3xl font-black uppercase leading-none tracking-[-.04em] text-gold md:text-5xl">{team.name}</h2></div>
          </div>
          <p className="mt-3 max-w-2xl text-sm font-semibold text-white/65">The title is secured. Celebrating the champion roster together with the tournament's Mythical Pair and Fan Favorite leaders.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 self-start rounded-2xl border border-gold/30 bg-black/20 px-4 py-3"><Trophy className="h-9 w-9 text-gold" fill="currentColor"/><div><div className="text-[9px] font-black uppercase tracking-[.2em] text-white/45">Dink & Dash 2026</div><div className="text-lg font-black uppercase">Champion Team</div></div></div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(330px,.85fr)]">
        <section className="rounded-2xl border border-white/10 bg-white/[.06] p-4 backdrop-blur-sm">
          <div className="flex items-end justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[.18em] text-gold">Winning team</div><h3 className="mt-1 text-xl font-black uppercase">Champion roster</h3></div><div className="text-right"><div className="text-2xl font-black text-gold">{players.length}</div><div className="text-[9px] font-black uppercase tracking-widest text-white/45">players</div></div></div>
          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-7">
            {players.map((player) => <Link key={player.id} href={`/players/${player.id}`} className="group min-w-0 rounded-xl border border-white/10 bg-black/15 p-2 text-center transition hover:-translate-y-0.5 hover:border-gold/50 hover:bg-white/10">
              <div className="mx-auto w-fit"><PlayerAvatar {...player} size="md"/></div>
              <div className="mt-2 truncate text-[10px] font-black group-hover:text-gold">{formatPlayerCompactName(player)}</div>
            </Link>)}
            {!players.length && <div className="col-span-full rounded-xl border border-dashed border-white/15 p-5 text-center text-xs font-semibold text-white/50">Champion roster is not available yet.</div>}
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <AwardPair title="Mythical Pair" icon={<Crown className="h-4 w-4" fill="currentColor"/>} left={maleMvp ? { player: maleMvp.player, meta: `Male · ${maleMvp.mvpIndex} index` } : undefined} right={femaleMvp ? { player: femaleMvp.player, meta: `Female · ${femaleMvp.mvpIndex} index` } : undefined}/>
          <AwardPair title="Fan Favorites" icon={<Heart className="h-4 w-4" fill="currentColor"/>} left={maleFan ? { player: maleFan.player, meta: `Male · ${maleFan.row._count._all} votes` } : undefined} right={femaleFan ? { player: femaleFan.player, meta: `Female · ${femaleFan.row._count._all} votes` } : undefined}/>
        </div>
      </div>
    </div>
  </section>;
}

function AwardPair({ title, icon, left, right }: {
  title: string;
  icon: ReactNode;
  left?: { player: PosterPlayer; meta: string };
  right?: { player: PosterPlayer; meta: string };
}) {
  return <section className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/15 to-white/[.04] p-3.5">
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.17em] text-gold">{icon}{title}</div>
    <div className="mt-3 grid grid-cols-2 gap-2">{[left, right].map((entry, index) => entry ? <Link key={entry.player.id} href={`/players/${entry.player.id}`} className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-2 text-center hover:border-gold/40">
      <div className="mx-auto w-fit"><PlayerAvatar {...entry.player} size="md"/></div><div className="mt-1.5 truncate text-xs font-black">{formatPlayerDisplayName(entry.player)}</div><div className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-wide text-white/45">{entry.meta}</div>
    </Link> : <div key={index} className="rounded-xl border border-dashed border-white/10 p-3 text-center text-[10px] font-bold text-white/35">Pending</div>)}</div>
  </section>;
}
