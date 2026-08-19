import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PlayerAvatar from "@/components/PlayerAvatar";
import GenderIndicator from "@/components/GenderIndicator";
import StatusBadge from "@/components/StatusBadge";
import { formatPlayerDisplayName } from "@/lib/player-name";
import { TeamLogo } from "@/components/TeamIdentity";
import { getTeamBranding, teamBrandingStyle } from "@/lib/team-branding";
import { computeStandings } from "@/lib/tournament/standings";

export const dynamic = "force-dynamic";

function matchupContext(matchup: { groupLabel: string | null; stage: string; roundLabel: string }) {
  const scope = matchup.groupLabel || matchup.stage.replaceAll("_", " ");
  const round = matchup.roundLabel.trim();
  if (!round || round.toLowerCase() === scope.toLowerCase()) return scope;
  if (matchup.groupLabel && round.toLowerCase().includes(matchup.groupLabel.toLowerCase())) return round;
  return `${scope} · ${round}`;
}

const STATUS_PRIORITY: Record<string, number> = {
  LIVE: 0,
  READY: 1,
  LINEUP_PENDING: 2,
  SCHEDULED: 3,
  INTERRUPTED: 4,
  COMPLETED: 5,
  FORFEITED: 5,
};

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await prisma.team.findFirst({
    where: { id, division: { isPublic: true, tournament: { isPublished: true } } },
    include: {
      group: true,
      division: true,
      players: {
        where: { isActive: true, participationStatus: "CONFIRMED" },
        include: { divisionEntries: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      },
      pairs: { where: { isActive: true }, include: { playerA: true, playerB: true } },
    },
  });
  if (!team) notFound();

  const [matchups, groupTeams, groupMatchups, standingOverrides] = await Promise.all([
    prisma.matchup.findMany({
      where: { divisionId: team.divisionId, OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
      include: {
        homeTeam: true,
        awayTeam: true,
        games: { select: { homeScore: true, awayScore: true, status: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { order: "asc" }],
    }),
    team.groupId ? prisma.team.findMany({ where: { groupId: team.groupId }, include: { group: true } }) : Promise.resolve([]),
    team.group ? prisma.matchup.findMany({
      where: { divisionId: team.divisionId, stage: "GROUP", groupLabel: team.group.name },
      include: { games: { select: { homeScore: true, awayScore: true, status: true } } },
      orderBy: { order: "asc" },
    }) : Promise.resolve([]),
    team.groupId ? prisma.groupStandingOverride.findMany({ where: { groupId: team.groupId }, select: { teamId: true, position: true } }) : Promise.resolve([]),
  ]);

  const players = team.division.entrantType === "PAIR" && team.pairs[0]
    ? [team.pairs[0].playerA, team.pairs[0].playerB]
    : team.players.filter((player) => player.divisionEntries.some((entry) => entry.divisionId === team.divisionId && entry.status === "CONFIRMED"));
  const standing = team.group ? computeStandings(groupTeams, groupMatchups, standingOverrides).find((row) => row.team.id === team.id) : null;
  const orderedMatchups = [...matchups].sort((first, second) => {
    const priority = (STATUS_PRIORITY[first.status] ?? 9) - (STATUS_PRIORITY[second.status] ?? 9);
    if (priority) return priority;
    if (first.queuePosition !== null || second.queuePosition !== null) return (first.queuePosition ?? Number.MAX_SAFE_INTEGER) - (second.queuePosition ?? Number.MAX_SAFE_INTEGER);
    return second.updatedAt.getTime() - first.updatedAt.getTime() || first.order - second.order;
  });

  return <main className="public-page mx-auto max-w-6xl px-4 py-3 md:py-8">
    <Link href={`/teams?division=${encodeURIComponent(team.division.slug)}`} className="text-sm font-bold text-court hover:text-ink">← Back to {team.division.entrantType === "PAIR" ? "pairs" : "teams"}</Link>

    <section className="public-hero relative isolate mt-2 overflow-hidden md:mt-4" style={{ ...teamBrandingStyle(team), backgroundColor: getTeamBranding(team).surface }}>
      {getTeamBranding(team).logoUrl && <img src={getTeamBranding(team).logoUrl!} alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-10 right-2 -z-10 h-48 w-48 object-contain opacity-[0.06]"/>}
      <div className="flex min-w-0 items-start gap-4">
        <TeamLogo team={team} size="lg"/>
        <div className="min-w-0">
          <div className="public-kicker">{team.division.name}{team.group ? <> · <Link href={`/groups/${team.group.slug}`} className="hover:text-ink hover:underline">{team.group.name}</Link></> : null}</div>
          <h1 className="public-title">{team.name}</h1>
          <p className="public-lede">{team.division.entrantType === "PAIR" ? "Fixed Executive pair" : `${players.length} confirmed player${players.length === 1 ? "" : "s"}`} · {team.shortName}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {standing && <span className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-black">Rank {standing.rankLabel} · {team.group?.name}</span>}
            {standing && <span className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-black">W–L {standing.won}–{standing.lost}</span>}
          </div>
        </div>
      </div>
    </section>

    <section className="mt-4 md:mt-7">
      <div className="mb-4"><div className="public-kicker">{team.division.entrantType === "PAIR" ? "Pair members" : "Roster"}</div><h2 className="text-2xl font-black tracking-tight">Players</h2></div>
      {players.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{players.map((player) => <Link key={player.id} href={`/players/${player.id}`} className="public-card group p-3 text-center md:p-4"><Player player={player}/><div className="mt-3 text-[9px] font-black uppercase tracking-widest text-court opacity-60 group-hover:opacity-100">View profile →</div></Link>)}</div> : <div className="public-empty">No confirmed public players are currently assigned to this entrant.</div>}
    </section>

    <section className="mt-6 md:mt-8">
      <div className="mb-4"><div className="public-kicker">Tournament schedule</div><h2 className="text-2xl font-black tracking-tight">Matches</h2></div>
      {orderedMatchups.length ? <div className="space-y-3">{orderedMatchups.map((matchup) => {
        const isHome = matchup.homeTeamId === team.id;
        const opponent = isHome ? matchup.awayTeam : matchup.homeTeam;
        const teamWins = isHome ? matchup.homeWins : matchup.awayWins;
        const opponentWins = isHome ? matchup.awayWins : matchup.homeWins;
        const decided = matchup.status === "COMPLETED" || matchup.status === "FORFEITED";
        const result = decided && matchup.winnerTeamId ? (matchup.winnerTeamId === team.id ? "W" : "L") : null;
        return <article key={matchup.id} className={`rounded-xl border bg-white p-4 shadow-sm ${result === "W" ? "border-emerald-200" : result === "L" ? "border-red-200" : matchup.status === "LIVE" ? "border-flame/40" : "border-line"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/matches/${matchup.id}`} className="text-[10px] font-black uppercase tracking-widest text-court hover:text-ink">{matchupContext(matchup)}</Link>
              <div className="mt-1 text-lg font-black">vs {opponent ? <Link href={`/teams/${opponent.id}`} className="hover:text-court">{opponent.name}</Link> : "TBD"}</div>
              {(matchup.queuePosition !== null || matchup.courtLabel) && <div className="mt-1 text-xs font-semibold text-gray-500">{matchup.queuePosition !== null ? `Queue #${matchup.queuePosition}` : ""}{matchup.queuePosition !== null && matchup.courtLabel ? " · " : ""}{matchup.courtLabel ? `Court ${matchup.courtLabel}` : ""}</div>}
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={matchup.status} compact/>
              <Link href={`/matches/${matchup.id}`} aria-label={`Open ${matchup.roundLabel}`} className="min-w-16 rounded-lg px-2 py-1 text-center hover:bg-paper"><div className={`text-2xl font-black tabular-nums ${result === "W" ? "text-emerald-700" : result === "L" ? "text-red-700" : "text-ink"}`}>{teamWins}–{opponentWins}</div>{result && <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">{result === "W" ? "Win" : "Loss"}</div>}</Link>
            </div>
          </div>
        </article>;
      })}</div> : <div className="public-empty">No matchups are currently assigned to this entrant.</div>}
    </section>
  </main>;
}

function Player({ player }: { player: { firstName: string; middleInitial?: string | null; lastName: string; displayName: string | null; avatarUrl: string | null; sex: string } }) {
  return <div className="text-center"><div className="mx-auto w-fit"><PlayerAvatar {...player} size="lg"/></div><div className="mt-3 flex items-center justify-center gap-1.5 font-black leading-tight"><span>{formatPlayerDisplayName(player)}</span><GenderIndicator sex={player.sex as "MALE" | "FEMALE"} className="text-base"/></div></div>;
}
