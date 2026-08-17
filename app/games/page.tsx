import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import { formatPlayerCompactName, formatPlayerDisplayName } from "@/lib/player-name";
import StatusBadge from "@/components/StatusBadge";
import PlayerAvatar from "@/components/PlayerAvatar";
import PublicAutoSubmitForm from "@/components/PublicAutoSubmitForm";
import AvatarPlayerSelect from "@/components/AvatarPlayerSelect";
import GenderIndicator from "@/components/GenderIndicator";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { label: "All", value: "ALL" },
  { label: "Live", value: "LIVE" },
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Ready", value: "READY" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Forfeited", value: "FORFEITED" },
] as const;

const GAME_STATUSES = ["SCHEDULED", "LIVE", "COMPLETED", "FORFEITED", "INTERRUPTED"] as const;

type StatusTab = typeof STATUS_TABS[number]["value"];
type GameStatus = typeof GAME_STATUSES[number];
type MatchQuery = { status?: string; page?: string; team?: string; player?: string; matchup?: string };

function isStatusTab(value: unknown): value is StatusTab {
  return typeof value === "string" && STATUS_TABS.some((tab) => tab.value === value);
}

function groupKey(game: {
  matchup: {
    id: string;
    division: { id: string; name: string };
    stage: string;
    groupLabel: string | null;
    roundLabel: string;
    courtLabel: string | null;
    order: number;
  };
}) {
  const scope = game.matchup.groupLabel || game.matchup.stage.replaceAll("_", " ");
  return `${game.matchup.id}::${game.matchup.division.name}::${scope}::${game.matchup.roundLabel}::Court ${game.matchup.courtLabel || "TBA"}`;
}

function groupLabel(key: string) {
  const [, division, scope, round, court] = key.split("::");
  const context = round && scope && round.toLowerCase().includes(scope.toLowerCase()) ? round : [scope, round].filter(Boolean).join(" · ");
  return { division, context, court };
}

function ScoreCell({ home, away, status }: { home: number; away: number; status: string }) {
  const homeWon = (status === "COMPLETED" || status === "FORFEITED") && home > away;
  const awayWon = (status === "COMPLETED" || status === "FORFEITED") && away > home;
  const decided = status === "COMPLETED" || status === "FORFEITED";
  const scoreClass = (winner: boolean, loser: boolean) => winner ? "border-emerald-600 bg-emerald-600 text-white" : loser ? "border-red-200 bg-red-50 text-red-800" : "border-line bg-paper text-ink";
  return <div className="flex items-center gap-2 font-black tabular-nums md:justify-center">
    <span className={`grid h-8 min-w-8 place-items-center border px-1.5 text-sm sm:h-9 sm:min-w-10 sm:px-2 ${scoreClass(homeWon, decided && awayWon)}`}>{home}</span>
    <span className="text-gray-400">:</span>
    <span className={`grid h-8 min-w-8 place-items-center border px-1.5 text-sm sm:h-9 sm:min-w-10 sm:px-2 ${scoreClass(awayWon, decided && homeWon)}`}>{away}</span>
  </div>;
}

function TeamChip({ team, side }: { team: { id: string; shortName: string }; side: "home" | "away" }) {
  const styles = side === "home" ? "border-court bg-court text-white" : "border-gold bg-gold/25 text-ink";
  return <Link href={`/teams/${team.id}`} className={`inline-flex min-w-10 items-center justify-center border px-2 py-1 text-[10px] font-black uppercase transition hover:ring-2 hover:ring-court/20 ${styles}`}>{team.shortName}</Link>;
}

function PairIdentity({ pair, team, side }: {
  pair: {
    playerA: { id: string; firstName: string; middleInitial?: string | null; lastName: string; displayName: string | null; avatarUrl?: string | null; sex: "MALE" | "FEMALE" };
    playerB: { id: string; firstName: string; middleInitial?: string | null; lastName: string; displayName: string | null; avatarUrl?: string | null; sex: "MALE" | "FEMALE" };
  };
  team: { id: string; shortName: string };
  side: "home" | "away";
}) {
  const right = side === "away";
  const players = [pair.playerA, pair.playerB];
  return <div className={`flex min-w-0 flex-col gap-1.5 md:flex-row md:items-center md:gap-2 ${right ? "items-end text-right md:flex-row-reverse" : "items-start"}`}>
    <div className="flex shrink-0 -space-x-2">{players.map((player) => <Link key={player.id} href={`/players/${player.id}`} aria-label={`View ${formatPlayerCompactName(player)}`} className="rounded-full transition hover:z-10 hover:ring-2 hover:ring-court/30"><PlayerAvatar {...player} size="sm"/></Link>)}</div>
    <div className="min-w-0"><TeamChip team={team} side={side}/><div className={`mt-1 flex flex-wrap items-center gap-x-1 text-xs font-bold leading-snug text-ink md:font-black ${right ? "justify-end" : "justify-start"}`}>{players.map((player, index) => <span key={player.id} className="inline-flex items-center gap-0.5">{index > 0 && <span className="mr-0.5 text-gray-400">/</span>}<Link href={`/players/${player.id}`} className="hover:text-court hover:underline">{formatPlayerCompactName(player)}</Link><GenderIndicator sex={player.sex} className="text-[11px]"/></span>)}</div></div>
  </div>;
}

function matchContext(matchup: { groupLabel: string | null; stage: string; roundLabel: string }) {
  const scope = matchup.groupLabel || matchup.stage.replaceAll("_", " ");
  const round = matchup.roundLabel.trim();
  if (!round || round.toLowerCase() === scope.toLowerCase()) return scope;
  if (matchup.groupLabel && round.toLowerCase().includes(matchup.groupLabel.toLowerCase())) return round;
  return `${scope} · ${round}`;
}

export default async function GamesPage({ searchParams }: { searchParams: Promise<MatchQuery> }) {
  const query = await searchParams;
  const activeTab = isStatusTab(query.status) ? query.status : "ALL";
  const gameStatus = GAME_STATUSES.includes(activeTab as GameStatus) ? activeTab as GameStatus : null;
  const readyFilter = activeTab === "READY";
  const pageSize = 60;
  const currentPage = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });

  if (!tournament) return <main className="public-page mx-auto max-w-7xl px-4 py-3 md:py-8">Run the seed script first.</main>;

  const [teams, allFilterPlayers, allMatchups] = await Promise.all([
    prisma.team.findMany({
      where: { division: { tournamentId: tournament.id, isPublic: true } },
      select: { id: true, name: true, shortName: true, division: { select: { name: true, sortOrder: true } } },
      orderBy: [{ division: { sortOrder: "asc" } }, { shortName: "asc" }],
    }),
    prisma.player.findMany({
      where: {
        tournamentId: tournament.id,
        isActive: true,
        participationStatus: "CONFIRMED",
        team: { division: { isPublic: true } },
      },
      select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true, sex: true, team: { select: { id: true, shortName: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.matchup.findMany({
      where: { tournamentId: tournament.id, division: { isPublic: true }, homeTeamId: { not: null }, awayTeamId: { not: null } },
      select: { id: true, divisionId: true, stage: true, groupLabel: true, roundLabel: true, order: true, homeTeamId: true, awayTeamId: true, homeTeam: { select: { name: true, shortName: true } }, awayTeam: { select: { name: true, shortName: true } }, division: { select: { name: true, sortOrder: true } } },
      orderBy: [{ division: { sortOrder: "asc" } }, { order: "asc" }],
    }),
  ]);

  const teamIds = new Set(teams.map((team) => team.id));
  const allPlayerIds = new Set(allFilterPlayers.map((player) => player.id));
  const allMatchupIds = new Set(allMatchups.map((matchup) => matchup.id));
  const teamId = query.team && teamIds.has(query.team) ? query.team : "";
  const requestedPlayer = query.player && allPlayerIds.has(query.player) ? allFilterPlayers.find((player) => player.id === query.player) : undefined;
  const requestedMatchup = query.matchup && allMatchupIds.has(query.matchup) ? allMatchups.find((matchup) => matchup.id === query.matchup) : undefined;

  const matchupTeamIds = requestedMatchup ? new Set([requestedMatchup.homeTeamId, requestedMatchup.awayTeamId]) : null;
  const filterPlayers = teamId
    ? allFilterPlayers.filter((player) => player.team?.id === teamId)
    : matchupTeamIds
      ? allFilterPlayers.filter((player) => player.team?.id && matchupTeamIds.has(player.team.id))
      : allFilterPlayers;
  const visiblePlayerIds = new Set(filterPlayers.map((player) => player.id));
  const playerId = requestedPlayer && visiblePlayerIds.has(requestedPlayer.id) ? requestedPlayer.id : "";
  const playerTeamId = playerId ? filterPlayers.find((player) => player.id === playerId)?.team?.id || "" : "";
  const matchupContextTeamId = teamId || playerTeamId;
  const matchups = matchupContextTeamId
    ? allMatchups.filter((matchup) => matchup.homeTeamId === matchupContextTeamId || matchup.awayTeamId === matchupContextTeamId)
    : allMatchups;
  const visibleMatchupIds = new Set(matchups.map((matchup) => matchup.id));
  const matchupId = requestedMatchup && visibleMatchupIds.has(requestedMatchup.id) ? requestedMatchup.id : "";

  const where: Prisma.GameWhereInput = {
    NOT: { status: "SCHEDULED", matchup: { status: "COMPLETED", winnerTeamId: { not: null } } },
    matchup: {
      tournamentId: tournament.id,
      division: { isPublic: true },
      ...(readyFilter ? { status: "READY" as const } : {}),
      ...(matchupId ? { id: matchupId } : {}),
    },
    ...(gameStatus ? { status: gameStatus } : {}),
    ...(teamId ? { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } : {}),
    ...(playerId ? {
      AND: [{
        OR: [
          { homePair: { OR: [{ playerAId: playerId }, { playerBId: playerId }] } },
          { awayPair: { OR: [{ playerAId: playerId }, { playerBId: playerId }] } },
        ],
      }],
    } : {}),
  };

  const [allGames, revision] = await Promise.all([
    prisma.game.findMany({
      where,
      include: {
        matchup: { include: { division: true } },
        homeTeam: true,
        awayTeam: true,
        homePair: { include: { playerA: true, playerB: true } },
        awayPair: { include: { playerA: true, playerB: true } },
      },
    }),
    getPublicTournamentRevision(tournament.id),
  ]);

  const groupSeries = new Map<string, number>();
  const groupedMatchups = new Map<string, typeof allMatchups>();
  for (const matchup of allMatchups.filter((item) => item.stage === "GROUP" || item.stage === "ROUND_ROBIN")) {
    const key = `${matchup.divisionId}::${matchup.groupLabel || "ROUND_ROBIN"}`;
    const rows = groupedMatchups.get(key) || [];
    rows.push(matchup);
    groupedMatchups.set(key, rows);
  }
  for (const rows of groupedMatchups.values()) {
    rows.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    rows.forEach((matchup, index) => groupSeries.set(matchup.id, index + 1));
  }

  const stagePriority = (stage: string) => {
    if (stage === "FINAL") return 0;
    if (stage === "THIRD_PLACE") return 1;
    if (stage === "SEMIFINAL") return 2;
    if (stage === "QUARTERFINAL") return 3;
    if (stage === "GROUP" || stage === "ROUND_ROBIN") return 4;
    return 5;
  };
  allGames.sort((a, b) => {
    const stageDiff = stagePriority(a.matchup.stage) - stagePriority(b.matchup.stage);
    if (stageDiff) return stageDiff;
    const groupLike = a.matchup.stage === "GROUP" || a.matchup.stage === "ROUND_ROBIN";
    if (groupLike) {
      const seriesDiff = (groupSeries.get(b.matchupId) ?? 0) - (groupSeries.get(a.matchupId) ?? 0);
      if (seriesDiff) return seriesDiff;
      const divisionDiff = a.matchup.division.sortOrder - b.matchup.division.sortOrder;
      if (divisionDiff) return divisionDiff;
      const groupDiff = (a.matchup.groupLabel || "").localeCompare(b.matchup.groupLabel || "");
      if (groupDiff) return groupDiff;
    } else {
      const divisionDiff = a.matchup.division.sortOrder - b.matchup.division.sortOrder;
      if (divisionDiff) return divisionDiff;
    }
    return a.matchup.order - b.matchup.order || a.gameNumber - b.gameNumber || a.id.localeCompare(b.id);
  });

  const totalGames = allGames.length;
  const totalPages = Math.max(1, Math.ceil(totalGames / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const games = allGames.slice((safePage - 1) * pageSize, safePage * pageSize);
  const filters = { status: activeTab, team: teamId, player: playerId, matchup: matchupId };

  const buildHref = (overrides: Partial<typeof filters> = {}, page = 1) => {
    const next = { ...filters, ...overrides };
    const params = new URLSearchParams();
    if (next.status !== "ALL") params.set("status", next.status);
    if (next.team) params.set("team", next.team);
    if (next.player) params.set("player", next.player);
    if (next.matchup) params.set("matchup", next.matchup);
    if (page > 1) params.set("page", String(page));
    const suffix = params.toString();
    return suffix ? `/games?${suffix}` : "/games";
  };

  const staleFilters =
    (query.team && query.team !== teamId) ||
    (query.player && query.player !== playerId) ||
    (query.matchup && query.matchup !== matchupId) ||
    (query.status && query.status !== activeTab);
  if (staleFilters) redirect(buildHref({}, currentPage));
  if (totalGames > 0 && currentPage > totalPages) redirect(buildHref({}, totalPages));

  const grouped = games.reduce((groups, game) => {
    const key = groupKey(game);
    const rows = groups.get(key) || [];
    rows.push(game);
    rows.sort((a, b) => a.gameNumber - b.gameNumber);
    groups.set(key, rows);
    return groups;
  }, new Map<string, typeof games>());
  const hasPrimaryFilters = Boolean(teamId || playerId || matchupId);

  return <main className="public-page mx-auto max-w-7xl px-4 py-3 md:py-8">
    <TournamentSync initialRevision={revision} />
    <section className="public-hero">
      <div><div className="public-kicker">Match directory</div><h1 className="public-title">Matches</h1><div className="mt-1.5 text-xs font-bold text-gray-500 md:mt-2 md:text-sm">{totalGames} match{totalGames === 1 ? "" : "es"}</div></div>
    </section>

    <PublicAutoSubmitForm className="public-filter relative mt-3 grid grid-cols-2 gap-2 md:mt-6 md:gap-3 lg:grid-cols-[1fr_1.15fr_1.25fr_auto]">
      {activeTab !== "ALL" && <input type="hidden" name="status" value={activeTab}/>} 
      <label><span className="filter-label">District / Team</span><select name="team" defaultValue={teamId} className="filter-control"><option value="">All districts / teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.shortName} · {team.division.name}</option>)}</select></label>
      <div><span className="filter-label">Player</span><AvatarPlayerSelect
        name="player"
        value={playerId}
        autoSubmit
        placeholder="All players"
        options={filterPlayers.map((player) => ({
          id: player.id,
          label: formatPlayerDisplayName(player),
          meta: player.team?.shortName || "Unassigned",
          avatar: player,
        }))}
      /></div>
      <label className="col-span-2 lg:col-span-1"><span className="filter-label">Matchup</span><select name="matchup" defaultValue={matchupId} className="filter-control"><option value="">All matchups</option>{matchups.map((matchup) => <option key={matchup.id} value={matchup.id}>{matchup.homeTeam?.shortName || "TBD"} vs {matchup.awayTeam?.shortName || "TBD"} · {matchContext(matchup)}</option>)}</select></label>
      <div className="col-span-2 flex items-end lg:col-span-1">{hasPrimaryFilters && <Link href={buildHref({ team: "", player: "", matchup: "" })} className="btn-ghost min-h-10 w-full px-3 lg:min-h-11 lg:w-auto">Clear filters</Link>}</div>
    </PublicAutoSubmitForm>

    <div className="mt-4 flex items-center gap-3"><span className="hidden text-[10px] font-extrabold uppercase tracking-widest text-gray-400 sm:block">Status</span><nav className="flex min-w-0 flex-1 gap-2 overflow-x-auto border-b border-court/20 pb-2 text-sm font-bold">
      {STATUS_TABS.map((tab) => {
        const active = activeTab === tab.value;
        return <Link key={tab.value} href={buildHref({ status: tab.value })} className={`shrink-0 border px-3 py-2 ${active ? "border-court bg-court text-white" : "border-line bg-white hover:border-court hover:text-court"}`}>{tab.label}</Link>;
      })}
    </nav></div>

    {games.length ? <><div className="mt-4 space-y-4 md:mt-6 md:space-y-5">
      {[...grouped.entries()].map(([key, rows]) => {
        const label = groupLabel(key);
        const firstGame = rows[0]!;
        const matchup = firstGame.matchup;
        const homeWins = rows.filter((game) => game.homeScore > game.awayScore && (game.status === "COMPLETED" || game.status === "FORFEITED")).length;
        const awayWins = rows.filter((game) => game.awayScore > game.homeScore && (game.status === "COMPLETED" || game.status === "FORFEITED")).length;
        return <section key={key} className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          <div className="bg-gradient-to-r from-court/10 via-white to-gold/10">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div><div className="label text-court">{label.division} · {label.context} · {label.court}</div><h2 className="mt-1 flex flex-wrap items-baseline gap-x-2 text-lg font-black text-ink"><Link href={`/teams/${firstGame.homeTeam.id}`} className="hover:text-court">{firstGame.homeTeam.name}</Link><span className="text-gray-400">vs</span><Link href={`/teams/${firstGame.awayTeam.id}`} className="hover:text-court">{firstGame.awayTeam.name}</Link></h2></div>
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={matchup.status} compact/><div className="flex items-center border border-line bg-white text-sm font-black tabular-nums"><span className="bg-court px-3 py-2 text-white">{homeWins}</span><span className="px-2 text-gray-400">-</span><span className="bg-gold/30 px-3 py-2 text-ink">{awayWins}</span></div><Link href={`/matches/${matchup.id}`} className="btn-ghost px-3 py-2 text-xs">Open matchup</Link></div>
            </div>
          </div>
          <div className="hidden grid-cols-[70px_minmax(0,1fr)_120px_minmax(0,1fr)_110px] border-b border-line bg-ink px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white md:grid"><div>Match</div><div>Blue side</div><div className="text-center">Score</div><div className="text-right">Gold side</div><div className="text-right">Status</div></div>
          <div className="divide-y divide-line">
            {rows.map((game) => <div key={game.id} className={`block hover:bg-court/5 ${game.status === "LIVE" ? "bg-flame/5" : ""}`}>
              <div className="p-3 md:hidden"><div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center border border-court/30 bg-court/10 text-sm font-black text-court">M{game.gameNumber}</span><StatusBadge status={game.status} compact/></div><Link href={`/matches/${game.matchupId}`} className="text-[10px] font-bold uppercase text-court hover:text-ink">Open matchup →</Link></div><div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"><PairIdentity pair={game.homePair} team={game.homeTeam} side="home"/><ScoreCell home={game.homeScore} away={game.awayScore} status={game.status}/><PairIdentity pair={game.awayPair} team={game.awayTeam} side="away"/></div></div>
              <div className="hidden gap-3 px-4 py-3 md:grid md:grid-cols-[70px_minmax(0,1fr)_120px_minmax(0,1fr)_110px] md:items-center"><Link href={`/matches/${game.matchupId}`} aria-label={`Open match ${game.gameNumber}`} className="grid h-10 w-10 place-items-center border border-court/30 bg-court/10 text-xl font-black text-court hover:border-court hover:bg-court hover:text-white">{game.gameNumber}</Link><div className="min-w-0"><PairIdentity pair={game.homePair} team={game.homeTeam} side="home"/>{(game.status === "COMPLETED" || game.status === "FORFEITED") && game.homeScore > game.awayScore && <span className="mt-1 inline-block text-[10px] font-black uppercase tracking-widest text-emerald-700">Winner</span>}</div><ScoreCell home={game.homeScore} away={game.awayScore} status={game.status}/><div className="min-w-0 text-right"><PairIdentity pair={game.awayPair} team={game.awayTeam} side="away"/>{(game.status === "COMPLETED" || game.status === "FORFEITED") && game.awayScore > game.homeScore && <span className="mt-1 inline-block text-[10px] font-black uppercase tracking-widest text-emerald-700">Winner</span>}</div><div className="text-right"><StatusBadge status={game.status}/></div></div>
            </div>)}
          </div>
        </section>;
      })}
    </div>{totalPages > 1 && <nav className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-line bg-white p-3 text-sm font-bold"><Link href={buildHref({}, Math.max(1, safePage - 1))} className={`btn-ghost px-3 py-2 ${safePage === 1 ? "pointer-events-none opacity-45" : ""}`}>Previous</Link><span className="text-gray-600">Page {safePage} of {totalPages}</span><Link href={buildHref({}, Math.min(totalPages, safePage + 1))} className={`btn-ghost px-3 py-2 ${safePage === totalPages ? "pointer-events-none opacity-45" : ""}`}>Next</Link></nav>}</> : <div className="public-empty mt-6">No matches fit these filters.</div>}
  </main>;
}
