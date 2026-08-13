import Link from "next/link";
import LiveGamesGrid from "@/components/LiveGamesGrid";
import StandingsTable from "@/components/StandingsTable";
import PlayerAvatar from "@/components/PlayerAvatar";
import { prisma } from "@/lib/prisma";
import { areGroupMatchupsComplete, computeStandings, qualificationOutcomes, selectDivisionQualifiers } from "@/lib/tournament/standings";
import { calculateMvpRankings } from "@/lib/tournament/mvp";
import { formatPlayerDisplayName } from "@/lib/player-name";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import StatusBadge from "@/components/StatusBadge";
import BracketBoard, { KNOCKOUT_STAGES } from "@/components/BracketBoard";
import MythicalPairPoster from "@/components/MythicalPairPoster";
import ChampionCelebrationPoster from "@/components/ChampionCelebrationPoster";
import { Crown, Heart } from "lucide-react";
import { getFanFavoriteSnapshot } from "@/lib/tournament/fan-favorite";

export const dynamic = "force-dynamic";

function matchupContext(matchup: { groupLabel: string | null; stage: string; roundLabel: string }) {
  const scope = matchup.groupLabel || matchup.stage.replaceAll("_", " ");
  const round = matchup.roundLabel.trim();
  if (!round) return scope;
  if (matchup.groupLabel && round.toLowerCase().includes(matchup.groupLabel.toLowerCase())) return round;
  if (round.toLowerCase() === scope.toLowerCase()) return round;
  return `${scope} · ${round}`;
}

export default async function Home() {
  const tournament = await prisma.tournament.findFirst({
    where: { isPublished: true },
    include: {
      divisions: {
        where: { isPublic: true },
        include: {
          groups: { include: { standingOverrides: true, teams: { include: { group: true } } }, orderBy: { name: "asc" } },
          teams: true,
          matchups: {
            include: { homeTeam: true, awayTeam: true, winnerTeam: true, games: { select: { homeScore: true, awayScore: true, status: true } } },
            orderBy: { order: "asc" },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!tournament) return <main className="public-page mx-auto max-w-7xl p-6">Run the seed script first.</main>;

  const championFinals = tournament.divisions.flatMap((division) => division.matchups
    .filter((matchup) => matchup.stage === "FINAL" && matchup.winnerTeamId && matchup.winnerTeam && (matchup.status === "COMPLETED" || matchup.status === "FORFEITED"))
    .map((matchup) => ({ division, matchup })));
  const championTeamIds = championFinals.map(({ matchup }) => matchup.winnerTeamId!).filter(Boolean);

  const [live, upcoming, fanSnapshot, mvpGames, championPlayers, revision] = await Promise.all([
    prisma.game.findMany({
      where: { status: { in: ["LIVE", "INTERRUPTED"] }, matchup: { tournamentId: tournament.id, division: { isPublic: true } } },
      select: {
        id: true, matchupId: true, gameNumber: true, homeScore: true, awayScore: true, status: true, winnerTeamId: true,
        matchup: { select: { courtLabel: true, roundLabel: true } },
        homeTeam: { select: { id: true, shortName: true } },
        awayTeam: { select: { id: true, shortName: true } },
        homePair: { select: { id: true, playerA: { select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true } }, playerB: { select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true } } } },
        awayPair: { select: { id: true, playerA: { select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true } }, playerB: { select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true } } } },
      },
      orderBy: [{ startedAt: { sort: "desc", nulls: "last" } }, { gameNumber: "asc" }],
    }),
    prisma.matchup.findMany({ where: { tournamentId: tournament.id, division: { isPublic: true }, queuePosition: { not: null }, status: { in: ["READY", "LINEUP_PENDING", "SCHEDULED"] } }, include: { division: true, homeTeam: true, awayTeam: true }, orderBy: [{ queuePosition: "asc" }, { order: "asc" }], take: 8 }),
    getFanFavoriteSnapshot(tournament.id),
    prisma.game.findMany({
      where: { matchup: { tournamentId: tournament.id, division: { isPublic: true } }, status: { in: ["COMPLETED", "FORFEITED"] } },
      include: {
        homePair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
        awayPair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
      },
    }),
    prisma.player.findMany({
      where: { teamId: { in: championTeamIds }, isActive: true, participationStatus: "CONFIRMED" },
      select: { id: true, teamId: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true },
      orderBy: [{ sex: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
    }),
    getPublicTournamentRevision(tournament.id),
  ]);

  const maleFanRanking = fanSnapshot.rankingsBySex.male[0];
  const femaleFanRanking = fanSnapshot.rankingsBySex.female[0];
  const maleFanLeader = maleFanRanking?.player ? { row: { playerId: maleFanRanking.player.id, _count: { _all: maleFanRanking.votes } }, player: maleFanRanking.player } : undefined;
  const femaleFanLeader = femaleFanRanking?.player ? { row: { playerId: femaleFanRanking.player.id, _count: { _all: femaleFanRanking.votes } }, player: femaleFanRanking.player } : undefined;
  const totalFanVotes = fanSnapshot.totalVotes;

  const groupCards = tournament.divisions.flatMap((division) => {
    const groupMatchups = division.matchups.filter((matchup) => matchup.stage === "GROUP");
    const tables = division.groups.map((group) => computeStandings(group.teams, groupMatchups.filter((matchup) => matchup.groupLabel === group.name), group.standingOverrides));
    const outcomes = division.formatType === "GROUP_KNOCKOUT" ? qualificationOutcomes(tables, division.qualifiersPerGroup, division.wildcardCount, { groupStageComplete: areGroupMatchupsComplete(groupMatchups) }) : new Map();
    return division.groups.map((group, index) => ({ division, group, standings: tables[index] ?? [], qualificationByTeam: outcomes }));
  });
  const wildcardCards = tournament.divisions.flatMap((division) => {
    if (division.formatType !== "GROUP_KNOCKOUT" || !division.groups.length || !division.wildcardCount) return [];
    const groupMatchups = division.matchups.filter((matchup) => matchup.stage === "GROUP");
    if (!areGroupMatchupsComplete(groupMatchups)) return [];
    const tables = division.groups.map((group) => computeStandings(group.teams, groupMatchups.filter((matchup) => matchup.groupLabel === group.name), group.standingOverrides));
    return selectDivisionQualifiers(tables, division.qualifiersPerGroup, division.wildcardCount).wildcards.map((row) => ({ division: division.name, row }));
  });
  const bracketDivisions = tournament.divisions.map((division) => ({
    division,
    matchups: division.matchups.filter((matchup) => KNOCKOUT_STAGES.includes(matchup.stage as (typeof KNOCKOUT_STAGES)[number])),
  })).filter(({ division, matchups }) => division.formatType === "GROUP_KNOCKOUT" || division.formatType === "SINGLE_ELIMINATION" || matchups.length > 0);
  const mvp = calculateMvpRankings(mvpGames);

  return <main className="public-page"><TournamentSync initialRevision={revision}/><section className="overflow-hidden border-b border-line bg-ink text-white">
    <div className="relative">
      <picture><source srcSet="/finalbanner.webp" type="image/webp"/><img src="/finalbanner.png" width={2428} height={648} fetchPriority="high" decoding="async" alt="MPW Dink and Dash 2026 event banner" className="block h-auto w-full" /></picture>
      <div className="absolute inset-0 hidden md:block"><div className="mx-auto flex h-full max-w-7xl items-end justify-end px-4 pb-5 lg:pb-6"><HeroActions desktop /></div></div>
    </div>
    <div className="mx-auto max-w-7xl px-3 py-3 md:hidden"><HeroActions /></div>
  </section><div className="mx-auto max-w-7xl space-y-7 px-4 py-6 md:space-y-10 md:py-8">
    {championFinals.length ? <section className="space-y-5">{championFinals.map(({ division, matchup }) => <ChampionCelebrationPoster
      key={matchup.id}
      divisionName={division.name}
      team={matchup.winnerTeam!}
      players={championPlayers.filter((player) => player.teamId === matchup.winnerTeamId)}
      maleMvp={mvp.male[0]}
      femaleMvp={mvp.female[0]}
      maleFan={maleFanLeader}
      femaleFan={femaleFanLeader}
      championImageUrl={division.championImageTeamId === matchup.winnerTeamId ? division.championImageUrl : null}
    />)}</section> : <LiveGamesGrid initial={live}/>} 

    {groupCards.length > 0 && <section><div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><div className="label">Group-stage divisions</div><h2 className="text-2xl font-black uppercase">Standings</h2></div>{wildcardCards.length > 0 && <div className="flex flex-wrap gap-2">{wildcardCards.map(({ division, row }) => <div key={`${division}-${row.team.id}`} className="border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><span className="label text-emerald-700">{division} wildcard · qualified</span><strong className="ml-2">{row.team.name}</strong></div>)}</div>}</div><div className="grid gap-5 lg:grid-cols-2">{groupCards.map(({ division, group, standings, qualificationByTeam }) => <div className="panel min-w-0 overflow-hidden" key={group.id}><div className="flex items-center justify-between border-b border-line bg-gray-50/70 p-4"><div><div className="label">{division.name}</div><h3 className="font-black">{group.name}</h3></div><Link href={`/groups/${group.slug}`} className="text-xs font-bold text-court">Full group →</Link></div><StandingsTable rows={standings} qualificationByTeam={qualificationByTeam}/></div>)}</div></section>}

    {bracketDivisions.length > 0 && <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><div className="label">Knockout progression</div><h2 className="text-2xl font-black uppercase">Tournament Bracket</h2><p className="mt-1 hidden text-sm text-gray-500 md:block">Live bracket slots update as qualifiers and knockout winners are resolved.</p></div>
        <Link href="/bracket" className="btn border-flame bg-flame px-3 py-2 text-white hover:bg-white hover:text-flame md:px-4">View Full Bracket</Link>
      </div>
      <div className="space-y-5">{bracketDivisions.map(({ division, matchups }) => <section key={division.id} className="panel overflow-hidden">
        <div className="border-b border-line px-4 py-3"><div className="label text-court">{division.formatType.replaceAll("_", " ")}</div><h3 className="font-black uppercase">{division.name}</h3></div>
        {matchups.length ? <BracketBoard matchups={matchups} /> : <div className="p-6 text-sm text-gray-500">Knockout slots are not configured yet. They will appear here as soon as the organizer creates or generates the bracket.</div>}
      </section>)}</div>
    </section>}

    <section className="grid gap-6 lg:grid-cols-2"><div><div className="mb-4"><div className="label">Next on court</div><h2 className="text-2xl font-black uppercase">Upcoming matchups</h2></div><div className="space-y-3">{upcoming.length ? upcoming.map((matchup, index) => <Link key={matchup.id} href={`/matches/${matchup.id}`} className="panel flex items-center justify-between gap-3 p-4 hover:border-emerald-400"><div><div className="label">Next #{index + 1} · {matchup.division.name} · {matchupContext(matchup)} · Court {matchup.courtLabel || "TBA"}</div><div className="font-black">{matchup.homeTeam?.name || "TBD"} vs {matchup.awayTeam?.name || "TBD"}</div><div className="text-xs text-gray-500">{matchup.gamesPerMatchup} match{matchup.gamesPerMatchup === 1 ? "" : "es"}</div></div><StatusBadge status={matchup.status} compact/></Link>) : <div className="panel p-6 text-sm text-gray-500">The court queue is clear for now.</div>}</div></div><div><div className="mb-4 flex items-end justify-between gap-3"><div><div className="label text-flame">Public voting</div><h2 className="text-2xl font-black">Fan Favorite</h2></div></div><FanFavoriteHomeCard male={maleFanLeader} female={femaleFanLeader} totalVotes={totalFanVotes}/></div></section>
    <section><div className="mb-4"><div className="label">MVP</div><h2 className="text-2xl font-black uppercase">Current MVP leaders</h2></div>{(mvp.male[0] || mvp.female[0]) ? <MythicalPairPoster male={mvp.male[0]} female={mvp.female[0]} compact/> : <div className="panel p-6 text-sm text-gray-500">No completed matches yet.</div>}</section>
  </div></main>;
}

function HeroActions({ desktop = false }: { desktop?: boolean }) {
  const secondary = "btn min-h-10 min-w-0 border-white/60 bg-ink/40 px-3 text-center text-xs leading-tight text-white shadow-panel backdrop-blur-sm hover:bg-white hover:text-ink lg:px-4 lg:text-sm";
  return <div className={desktop ? "flex flex-wrap justify-end gap-2" : "grid grid-cols-2 gap-2"}>
    <Link href="/bracket" className="btn min-h-10 min-w-0 border-flame bg-flame px-3 text-center text-xs leading-tight text-white shadow-panel hover:bg-white hover:text-flame lg:px-4 lg:text-sm">View Bracket</Link>
    <Link href="/format" className={secondary}>Format Guide</Link>
    <Link href="/fan-favorite" className={secondary}>Vote Fan Favorite</Link>
    <Link href="/mvp" className={secondary}>MVP Rankings</Link>
  </div>;
}

function FanFavoriteHomeCard({ male, female, totalVotes }: {
  male?: { row: { playerId: string; _count: { _all: number } }; player: { id: string; firstName: string; middleInitial: string | null; lastName: string; displayName: string | null; avatarUrl: string | null; sex: "MALE" | "FEMALE"; team: { shortName: string } | null } };
  female?: { row: { playerId: string; _count: { _all: number } }; player: { id: string; firstName: string; middleInitial: string | null; lastName: string; displayName: string | null; avatarUrl: string | null; sex: "MALE" | "FEMALE"; team: { shortName: string } | null } };
  totalVotes: number;
}) {
  const leaders = [{ label: "Male leader", entry: male }, { label: "Female leader", entry: female }];
  return <div className="fan-arena relative overflow-hidden rounded-2xl border border-ink/10 p-4 text-white shadow-panel md:p-5">
    <Heart className="absolute -right-5 -top-6 h-28 w-28 rotate-12 text-white/5" fill="currentColor"/>
    <div className="relative z-10 flex items-start justify-between gap-3"><div><div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest"><Heart className="h-3 w-3" fill="currentColor"/> Fan Favorite</div><div className="mt-2 text-lg font-black">Current leaders</div><div className="mt-1 text-xs font-semibold text-white/70">{totalVotes ? `${totalVotes} valid votes` : "No votes yet"}</div></div><Crown className="h-7 w-7 shrink-0 text-gold" fill="currentColor"/></div>
    <div className="relative z-10 mt-4 grid gap-2 sm:grid-cols-2">{leaders.map(({ label, entry }) => entry ? <Link href={`/players/${entry.player.id}`} key={label} className="group flex items-center gap-3 rounded-xl bg-white/95 p-3 text-ink transition hover:-translate-y-0.5 hover:bg-white">
      <PlayerAvatar {...entry.player} size="md"/><div className="min-w-0 flex-1"><div className="text-[9px] font-black uppercase tracking-widest text-flame">{label}</div><div className="truncate font-black group-hover:text-court">{formatPlayerDisplayName(entry.player)}</div><div className="text-xs font-semibold text-gray-500">{entry.player.team?.shortName || "Player pool"}</div></div><div className="text-right"><div className="text-xl font-black text-court">{entry.row._count._all}</div><div className="text-[9px] font-black uppercase tracking-widest text-gray-400">votes</div></div>
    </Link> : <div key={label} className="rounded-xl border border-white/15 bg-white/10 p-4"><div className="text-[9px] font-black uppercase tracking-widest text-white/60">{label}</div><div className="mt-1 text-sm font-bold">No votes yet</div></div>)}</div>
    <Link href="/fan-favorite" className="relative z-10 mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gold px-4 text-sm font-black text-ink transition hover:-translate-y-0.5 hover:bg-white"><Heart className="h-4 w-4" fill="currentColor"/> Open Fan Favorite</Link>
  </div>;
}
