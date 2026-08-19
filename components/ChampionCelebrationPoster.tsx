import Link from "next/link";
import type { ReactNode } from "react";
import { Crown, Heart } from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";
import { formatPlayerCompactName, formatPlayerDisplayName } from "@/lib/player-name";
import type { MvpRow } from "@/lib/tournament/mvp";
import { TeamLogo } from "@/components/TeamIdentity";
import { getTeamBranding, teamBrandingStyle } from "@/lib/team-branding";

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
  championImageUrl,
}: {
  divisionName: string;
  team: { id: string; name: string; shortName: string; logoUrl: string | null; brandingPrimary: string | null; brandingSecondary: string | null; brandingAccent: string | null; brandingText: string | null; brandingSurface: string | null };
  players: PosterPlayer[];
  maleMvp?: MvpRow;
  femaleMvp?: MvpRow;
  maleFan?: FanLeader;
  femaleFan?: FanLeader;
  championImageUrl?: string | null;
}) {
  const branding = getTeamBranding(team);
  return <section className="overflow-hidden rounded-xl border border-line bg-white text-ink shadow-sm">
    <header className="relative isolate overflow-hidden border-b border-line px-4 py-5 md:px-6" style={{ ...teamBrandingStyle(team), color: branding.text, background: `linear-gradient(135deg, ${branding.primary}, ${branding.secondary})` }}>
      {branding.logoUrl && <img src={branding.logoUrl} alt="" aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 -z-10 h-56 w-56 object-contain opacity-10"/>}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <TeamLogo team={team} size="lg"/>
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[.2em] opacity-85">{divisionName} champion</div>
            <h2 className="mt-2 text-3xl font-black uppercase leading-tight md:text-5xl"><Link href={`/teams/${team.id}`} className="hover:opacity-80">{team.name}</Link></h2>
            <div className="mt-2 text-xs font-black uppercase tracking-[.18em] opacity-70">Dink & Dash 2026</div>
          </div>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-md border border-gold/50 bg-gold px-4 py-2 text-xs font-black uppercase tracking-[.15em] text-ink"><Crown className="h-4 w-4" fill="currentColor"/> Champion Team</div>
      </div>
    </header>

    <div className="p-4 md:p-6">
      {championImageUrl && <section className="overflow-hidden rounded-xl border border-line bg-paper">
        <img src={championImageUrl} alt={`${team.name} champion team`} width={1600} height={700} loading="lazy" decoding="async" className="aspect-[16/7] min-h-56 w-full object-cover md:min-h-80"/>
      </section>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,.85fr)]">
        <section className="rounded-xl border border-line bg-paper p-4 md:p-5">
          <div className="flex items-end justify-between gap-3">
            <div><div className="label">Winning team</div><h3 className="mt-1 text-xl font-black uppercase md:text-2xl">Champion roster</h3></div>
            <div className="text-right"><div className="text-3xl font-black text-court">{players.length}</div><div className="label">players</div></div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-7">
            {players.map((player) => <Link key={player.id} href={`/players/${player.id}`} className="group min-w-0 rounded-xl border border-line bg-white p-2 text-center transition hover:border-court">
              <div className="mx-auto w-fit"><PlayerAvatar {...player} size="md"/></div>
              <div className="mt-2 truncate text-[10px] font-black group-hover:text-court">{formatPlayerCompactName(player)}</div>
            </Link>)}
            {!players.length && <div className="col-span-full rounded-xl border border-dashed border-line p-5 text-center text-xs font-semibold text-gray-500">Champion roster is not available yet.</div>}
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <AwardPair title="Mythical Pair" icon={<Crown className="h-4 w-4" fill="currentColor"/>} left={maleMvp ? { player: maleMvp.player, meta: `Male - ${maleMvp.mvpIndex} pts` } : undefined} right={femaleMvp ? { player: femaleMvp.player, meta: `Female - ${femaleMvp.mvpIndex} pts` } : undefined}/>
          <AwardPair title="Fan Favorites" icon={<Heart className="h-4 w-4" fill="currentColor"/>} left={maleFan ? { player: maleFan.player, meta: `Male - ${maleFan.row._count._all} votes` } : undefined} right={femaleFan ? { player: femaleFan.player, meta: `Female - ${femaleFan.row._count._all} votes` } : undefined}/>
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
  return <section className="rounded-xl border border-line bg-white p-3.5">
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.17em] text-court">{icon}{title}</div>
    <div className="mt-3 grid grid-cols-2 gap-2">{[left, right].map((entry, index) => entry ? <Link key={entry.player.id} href={`/players/${entry.player.id}`} className="min-w-0 rounded-xl border border-line bg-paper p-2 text-center transition hover:border-court">
      <div className="mx-auto w-fit"><PlayerAvatar {...entry.player} size="md"/></div><div className="mt-1.5 truncate text-xs font-black">{formatPlayerDisplayName(entry.player)}</div><div className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-wide text-gray-500">{entry.meta}</div>
    </Link> : <div key={index} className="rounded-xl border border-dashed border-line p-3 text-center text-[10px] font-bold text-gray-400">Pending</div>)}</div>
  </section>;
}
