import Link from "next/link";
import LiveGamesGrid from "@/components/LiveGamesGrid";
import StandingsTable from "@/components/StandingsTable";
import PlayerAvatar from "@/components/PlayerAvatar";
import { prisma } from "@/lib/prisma";
import { areGroupMatchupsComplete, computeStandings, selectDivisionQualifiers } from "@/lib/tournament/standings";
import { calculateMvpRankings } from "@/lib/tournament/mvp";
import { formatPlayerDisplayName } from "@/lib/player-name";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import StatusBadge from "@/components/StatusBadge";
import BracketBoard, { KNOCKOUT_STAGES } from "@/components/BracketBoard";

export const dynamic = "force-dynamic";
export default async function Home() {
  const tournament = await prisma.tournament.findFirst({
    where: { isPublished: true },
    include: {
      divisions: { where: { isPublic: true }, include: { groups: { include: { standingOverrides: true, teams: { include: { group: true } } }, orderBy: { name: "asc" } }, teams: true, matchups: { include: { homeTeam: true, awayTeam: true, winnerTeam: true, games: { select: { homeScore: true, awayScore: true, status: true } } }, orderBy: { order: "asc" } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!tournament) return <main className="mx-auto max-w-7xl p-6">Run the seed script first.</main>;

  const [live, upcoming, voteGroups, mvpGames, revision] = await Promise.all([
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
      orderBy: { startedAt: "asc" },
    }),
    prisma.matchup.findMany({ where: { tournamentId: tournament.id, division: { isPublic: true }, queuePosition: { not: null }, status: { in: ["READY", "LINEUP_PENDING", "SCHEDULED"] } }, include: { division: true, homeTeam: true, awayTeam: true }, orderBy: [{ queuePosition: "asc" }, { order: "asc" }], take: 8 }),
    prisma.fanVote.groupBy({ by: ["playerId"], where: { tournamentId: tournament.id, player: { isActive: true, participationStatus: "CONFIRMED", team: { division: { isPublic: true } } } }, _count: { _all: true }, orderBy: { _count: { playerId: "desc" } }, take: 5 }),
    prisma.game.findMany({
      where: { matchup: { tournamentId: tournament.id, division: { isPublic: true } }, status: { in: ["COMPLETED", "FORFEITED"] } },
      include: {
        homePair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
        awayPair: { include: { playerA: { include: { team: true } }, playerB: { include: { team: true } } } },
      },
    }),
    getPublicTournamentRevision(tournament.id),
  ]);
  const fanPlayers = await prisma.player.findMany({ where: { id: { in: voteGroups.map((row) => row.playerId) } }, include: { team: true } });
  const fanById = new Map(fanPlayers.map((player) => [player.id, player]));
  const groupCards = tournament.divisions.flatMap((division) => division.groups.map((group) => {
    const matchups = division.matchups.filter((matchup) => matchup.stage === "GROUP" && matchup.groupLabel === group.name);
    return { division, group, standings: computeStandings(group.teams, matchups, group.standingOverrides) };
  }));
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

  return <main><TournamentSync initialRevision={revision}/><section className="overflow-hidden border-b border-line bg-ink text-white">
    <div className="relative">
      <img src="/finalbanner.png" alt="MPW Dink and Dash 2026 event banner" className="block h-auto w-full" />
      <div className="absolute inset-0 hidden md:block">
        <div className="mx-auto flex h-full max-w-7xl items-end justify-end px-4 pb-5 lg:pb-6">
          <HeroActions desktop />
        </div>
      </div>
    </div>
    <div className="mx-auto max-w-7xl px-3 py-3 md:hidden"><HeroActions /></div>
  </section><div className="mx-auto max-w-7xl space-y-7 px-4 py-6 md:space-y-10 md:py-8">
    <LiveGamesGrid initial={live}/>
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
    {groupCards.length > 0 && <section><div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><div className="label">Group-stage divisions</div><h2 className="text-2xl font-black uppercase">Standings</h2></div>{wildcardCards.length > 0 && <div className="flex flex-wrap gap-2">{wildcardCards.map(({ division, row }) => <div key={`${division}-${row.team.id}`} className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm"><span className="label">{division} wildcard</span><strong className="ml-2">{row.team.name}</strong></div>)}</div>}</div><div className="grid gap-5 lg:grid-cols-2">{groupCards.map(({ division, group, standings }) => <div className="panel min-w-0" key={group.id}><div className="flex items-center justify-between border-b border-line p-4"><div><div className="label">{division.name}</div><h3 className="font-black uppercase">{group.name}</h3></div><Link href={`/groups/${group.slug}`} className="text-xs font-bold text-court">Full group →</Link></div><StandingsTable rows={standings}/></div>)}</div></section>}
    <section className="grid gap-6 lg:grid-cols-2"><div><div className="mb-4"><div className="label">Next on court</div><h2 className="text-2xl font-black uppercase">Upcoming matchups</h2></div><div className="space-y-3">{upcoming.map((matchup, index) => <Link key={matchup.id} href={`/matches/${matchup.id}`} className="panel flex items-center justify-between gap-3 p-4 hover:border-court"><div><div className="label">Next #{index + 1} · {matchup.division.name} · {matchup.groupLabel || matchup.stage} · {matchup.roundLabel} · Court {matchup.courtLabel || "TBA"}</div><div className="font-black">{matchup.homeTeam?.name || "TBD"} vs {matchup.awayTeam?.name || "TBD"}</div><div className="text-xs text-gray-500">{matchup.gamesPerMatchup} match{matchup.gamesPerMatchup === 1 ? "" : "es"}</div></div><StatusBadge status={matchup.status} compact/></Link>)}</div></div><div><div className="mb-4"><div className="label">Crowd pulse</div><h2 className="text-2xl font-black uppercase">Fan Favorite leaders</h2></div><div className="panel divide-y divide-line">{voteGroups.length ? voteGroups.map((row, index) => { const player = fanById.get(row.playerId); return player ? <div key={row.playerId} className="flex items-center gap-3 p-4"><span className="w-6 text-xl font-black">{index + 1}</span><PlayerAvatar {...player} size={index === 0 ? "lg" : "md"}/><div className="flex-1"><div className="font-black">{formatPlayerDisplayName(player)}</div><div className="text-xs text-gray-500">{player.team?.shortName || "Player pool"}</div></div><strong>{row._count._all} votes</strong></div> : null; }) : <div className="p-8 text-center text-gray-500">No votes yet.</div>}<Link href="/fan-favorite" className="block p-4 text-center text-sm font-bold text-court">View live rankings →</Link></div></div></section>
    <section><div className="mb-4"><div className="label">Numbers supporting the judges</div><h2 className="text-2xl font-black uppercase">Current MVP leaders</h2></div><div className="grid gap-4 md:grid-cols-2"><MvpLeader title="Male MVP" row={mvp.male[0]}/><MvpLeader title="Female MVP" row={mvp.female[0]}/></div></section>
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

function MvpLeader({ title, row }: { title: string; row?: ReturnType<typeof calculateMvpRankings>["male"][number] }) {
  return <Link href="/mvp" className="panel flex items-center gap-4 p-4 hover:border-court md:p-5">
    {row && <PlayerAvatar {...row.player} size="lg"/>}
    <div className="min-w-0 flex-1"><div className="label">{title}</div>{row ? <><div className="mt-1 truncate text-lg font-black md:text-xl">{formatPlayerDisplayName(row.player)}</div><div className="text-xs text-gray-500 md:text-sm">{row.player.team?.shortName || "Historical pair"} · {row.wins}-{row.losses} · {row.confidence}% confidence</div></> : <div className="mt-2 text-gray-500">Complete matches to populate.</div>}</div>
    {row && <div className="shrink-0 text-right"><div className="text-2xl font-black text-court md:text-3xl">{row.mvpIndex}</div><div className="label hidden sm:block">MVP index</div></div>}
  </Link>;
}
