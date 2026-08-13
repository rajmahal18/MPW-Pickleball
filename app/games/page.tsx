import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import TournamentSync from "@/components/TournamentSync";
import { getPublicTournamentRevision } from "@/lib/tournament/revision";
import { formatPlayerCompactName } from "@/lib/player-name";
import StatusBadge from "@/components/StatusBadge";
import PlayerAvatar from "@/components/PlayerAvatar";

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

function isStatusTab(value: unknown): value is StatusTab {
  return typeof value === "string" && STATUS_TABS.some((tab) => tab.value === value);
}

function playerName(player: { firstName: string; middleInitial?: string | null; lastName: string; displayName: string | null }) {
  return formatPlayerCompactName(player);
}

function pairName(pair: {
  playerA: { firstName: string; middleInitial?: string | null; lastName: string; displayName: string | null };
  playerB: { firstName: string; middleInitial?: string | null; lastName: string; displayName: string | null };
}) {
  return `${playerName(pair.playerA)} / ${playerName(pair.playerB)}`;
}

function groupKey(game: {
  matchup: {
    division: { id: string; name: string };
    stage: string;
    groupLabel: string | null;
    roundLabel: string;
    courtLabel: string | null;
    order: number;
  };
}) {
  const scope = game.matchup.groupLabel || game.matchup.stage.replaceAll("_", " ");
  return `${game.matchup.division.id}::${game.matchup.division.name}::${scope}::${game.matchup.roundLabel}::Court ${game.matchup.courtLabel || "TBA"}::${game.matchup.order}`;
}

function groupLabel(key: string) {
  const [, division, scope, round, court] = key.split("::");
  const context = round && scope && round.toLowerCase().includes(scope.toLowerCase()) ? round : [scope, round].filter(Boolean).join(" · ");
  return { division, context, court };
}

function ScoreCell({ home, away, status }: { home: number; away: number; status: string }) {
  const homeWon = (status === "COMPLETED" || status === "FORFEITED") && home > away;
  const awayWon = (status === "COMPLETED" || status === "FORFEITED") && away > home;
  const scoreClass = (winner: boolean) =>
    winner ? "border-court bg-court text-white" : "border-line bg-paper text-ink";

  return <div className="flex items-center gap-2 font-black tabular-nums md:justify-center">
    <span className={`grid h-8 min-w-8 place-items-center border px-1.5 text-sm sm:h-9 sm:min-w-10 sm:px-2 ${scoreClass(homeWon)}`}>{home}</span>
    <span className="text-gray-400">:</span>
    <span className={`grid h-8 min-w-8 place-items-center border px-1.5 text-sm sm:h-9 sm:min-w-10 sm:px-2 ${scoreClass(awayWon)}`}>{away}</span>
  </div>;
}

function TeamChip({ label, side }: { label: string; side: "home" | "away" }) {
  const styles = side === "home"
    ? "border-court bg-court text-white"
    : "border-gold bg-gold/25 text-ink";
  return <span className={`inline-flex min-w-10 items-center justify-center border px-2 py-1 text-[10px] font-black uppercase ${styles}`}>
    {label}
  </span>;
}

function PairIdentity({ pair, team, side }: {
  pair: {
    playerA: { id: string; firstName: string; middleInitial?: string | null; lastName: string; displayName: string | null; avatarUrl?: string | null };
    playerB: { id: string; firstName: string; middleInitial?: string | null; lastName: string; displayName: string | null; avatarUrl?: string | null };
  };
  team: string;
  side: "home" | "away";
}) {
  const right = side === "away";
  return <div className={`flex min-w-0 flex-col gap-1.5 md:flex-row md:items-center md:gap-2 ${right ? "items-end text-right md:flex-row-reverse" : "items-start"}`}>
    <div className="flex shrink-0 -space-x-2" aria-hidden="true"><PlayerAvatar {...pair.playerA} size="sm"/><PlayerAvatar {...pair.playerB} size="sm"/></div>
    <div className="min-w-0">
      <TeamChip label={team} side={side}/><div className="mt-1 line-clamp-2 text-xs font-bold leading-snug text-ink md:truncate md:font-black">{pairName(pair)}</div>
    </div>
  </div>;
}

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const query = await searchParams;
  const activeTab = isStatusTab(query.status) ? query.status : "ALL";
  const gameStatus = GAME_STATUSES.includes(activeTab as GameStatus) ? activeTab as GameStatus : null;
  const readyFilter = activeTab === "READY";
  const pageSize = 60;
  const currentPage = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });

  if (!tournament) return <main className="public-page mx-auto max-w-7xl px-4 py-5 md:py-8">Run the seed script first.</main>;

  const where: Prisma.GameWhereInput = {
    NOT: { status: "SCHEDULED", matchup: { status: "COMPLETED", winnerTeamId: { not: null } } },
    matchup: {
      tournamentId: tournament.id,
      division: { isPublic: true },
      ...(readyFilter ? { status: "READY" as const } : {}),
    },
    ...(gameStatus ? { status: gameStatus } : {}),
  };

  const [games, totalGames, revision] = await Promise.all([
    prisma.game.findMany({
      where,
      include: {
        matchup: { include: { division: true } },
        homeTeam: true,
        awayTeam: true,
        homePair: { include: { playerA: true, playerB: true } },
        awayPair: { include: { playerA: true, playerB: true } },
      },
      orderBy: [
        { matchup: { queuePosition: { sort: "asc", nulls: "last" } } },
        { matchup: { order: "asc" } },
        { gameNumber: "asc" },
        { id: "asc" },
      ],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    }),
    prisma.game.count({ where }),
    getPublicTournamentRevision(tournament.id),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalGames / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (activeTab !== "ALL") params.set("status", activeTab);
    if (page > 1) params.set("page", String(page));
    const suffix = params.toString();
    return suffix ? `/games?${suffix}` : "/games";
  };
  if (totalGames > 0 && currentPage > totalPages) redirect(pageHref(totalPages));

  const grouped = games.reduce((groups, game) => {
    const key = groupKey(game);
    const rows = groups.get(key) || [];
    rows.push(game);
    groups.set(key, rows);
    return groups;
  }, new Map<string, typeof games>());

  return <main className="public-page mx-auto max-w-7xl px-4 py-5 md:py-8">
    <TournamentSync initialRevision={revision} />
    <div className="label text-court">Tournament matches</div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-3xl font-black uppercase text-ink md:text-4xl">Matches</h1>
      <span className="border border-court/30 bg-court/10 px-3 py-2 text-xs font-black text-court">{totalGames} total</span>
    </div>

    <nav className="mt-5 flex gap-2 overflow-x-auto border-b border-court/20 pb-2 text-sm font-bold">
      {STATUS_TABS.map((tab) => {
        const active = activeTab === tab.value;
        return <Link
          key={tab.value}
          href={tab.value === "ALL" ? "/games" : `/games?status=${tab.value}`}
          className={`shrink-0 border px-3 py-2 ${active ? "border-court bg-court text-white" : "border-line bg-white hover:border-court hover:text-court"}`}
        >
          {tab.label}
        </Link>;
      })}
    </nav>

    {games.length ? <><div className="mt-6 space-y-5">
      {[...grouped.entries()].map(([key, rows]) => {
        const label = groupLabel(key);
        const firstGame = rows[0]!;
        const matchup = firstGame.matchup;
        const homeWins = rows.filter((game) => game.homeScore > game.awayScore && (game.status === "COMPLETED" || game.status === "FORFEITED")).length;
        const awayWins = rows.filter((game) => game.awayScore > game.homeScore && (game.status === "COMPLETED" || game.status === "FORFEITED")).length;
        return <section key={key} className="overflow-hidden border border-line bg-white">
          <div className="border-l-4 border-court bg-gradient-to-r from-court/10 via-white to-gold/10">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <div className="label text-court">{label.division} · {label.context} · {label.court}</div>
                <h2 className="mt-1 text-lg font-black text-ink">{firstGame.homeTeam.name} vs {firstGame.awayTeam.name}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={matchup.status} compact/>
                <div className="flex items-center border border-line bg-white text-sm font-black tabular-nums">
                  <span className="bg-court px-3 py-2 text-white">{homeWins}</span>
                  <span className="px-2 text-gray-400">-</span>
                  <span className="bg-gold/30 px-3 py-2 text-ink">{awayWins}</span>
                </div>
                <Link href={`/matches/${matchup.id}`} className="btn-ghost px-3 py-2 text-xs">Open matchup</Link>
              </div>
            </div>
          </div>

          <div className="hidden grid-cols-[70px_minmax(0,1fr)_120px_minmax(0,1fr)_110px] border-b border-line bg-ink px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white md:grid">
            <div>Match</div>
            <div>Blue side</div>
            <div className="text-center">Score</div>
            <div className="text-right">Gold side</div>
            <div className="text-right">Status</div>
          </div>

          <div className="divide-y divide-line">
            {rows.map((game) => <Link
              key={game.id}
              href={`/matches/${game.matchupId}`}
              className={`block hover:bg-court/5 ${game.status === "LIVE" ? "bg-flame/5" : ""}`}
            >
              <div className="p-3 md:hidden">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center border border-court/30 bg-court/10 text-sm font-black text-court">M{game.gameNumber}</span><StatusBadge status={game.status} compact/></div>
                  <span className="text-[10px] font-bold uppercase text-gray-400">Tap for matchup</span>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <PairIdentity pair={game.homePair} team={game.homeTeam.shortName} side="home"/>
                  <ScoreCell home={game.homeScore} away={game.awayScore} status={game.status}/>
                  <PairIdentity pair={game.awayPair} team={game.awayTeam.shortName} side="away"/>
                </div>
              </div>
              <div className="hidden gap-3 px-4 py-3 md:grid md:grid-cols-[70px_minmax(0,1fr)_120px_minmax(0,1fr)_110px] md:items-center">
                <div className="grid h-10 w-10 place-items-center border border-court/30 bg-court/10 text-xl font-black text-court">{game.gameNumber}</div>
                <div className="min-w-0"><PairIdentity pair={game.homePair} team={game.homeTeam.shortName} side="home"/>{(game.status === "COMPLETED" || game.status === "FORFEITED") && game.homeScore > game.awayScore && <span className="mt-1 inline-block text-[10px] font-black uppercase tracking-widest text-court">Winner</span>}</div>
                <ScoreCell home={game.homeScore} away={game.awayScore} status={game.status}/>
                <div className="min-w-0 text-right"><PairIdentity pair={game.awayPair} team={game.awayTeam.shortName} side="away"/>{(game.status === "COMPLETED" || game.status === "FORFEITED") && game.awayScore > game.homeScore && <span className="mt-1 inline-block text-[10px] font-black uppercase tracking-widest text-court">Winner</span>}</div>
                <div className="text-right"><StatusBadge status={game.status}/></div>
              </div>
            </Link>)}
          </div>
        </section>;
      })}
    </div>{totalPages > 1 && <nav className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-line bg-white p-3 text-sm font-bold">
      <Link href={pageHref(Math.max(1, safePage - 1))} className={`btn-ghost px-3 py-2 ${safePage === 1 ? "pointer-events-none opacity-45" : ""}`}>Previous</Link>
      <span className="text-gray-600">Page {safePage} of {totalPages}</span>
      <Link href={pageHref(Math.min(totalPages, safePage + 1))} className={`btn-ghost px-3 py-2 ${safePage === totalPages ? "pointer-events-none opacity-45" : ""}`}>Next</Link>
    </nav>}</> : <div className="mt-6 border border-line bg-white p-8 text-center text-gray-500">No matches fit this filter. Matches are created after both team leaders submit valid lineups.</div>}
  </main>;
}
