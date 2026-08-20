import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PlayerAvatar from "@/components/PlayerAvatar";
import GenderIndicator from "@/components/GenderIndicator";
import StatusBadge from "@/components/StatusBadge";
import { formatPlayerDisplayName, formatPlayerCompactName } from "@/lib/player-name";
import { TeamHeroArtwork, TeamIdentity, TeamLogo } from "@/components/TeamIdentity";
import { getTeamBranding, teamHeroStyle } from "@/lib/team-branding";
import { publicDivisionFilter } from "@/lib/public-preview";

export const dynamic = "force-dynamic";

type HistoryGame = Awaited<ReturnType<typeof loadHistory>>[number];

function matchupContext(matchup: { groupLabel: string | null; stage: string; roundLabel: string }) {
  const scope = matchup.groupLabel || matchup.stage.replaceAll("_", " ");
  const round = matchup.roundLabel.trim();
  if (!round || round.toLowerCase() === scope.toLowerCase()) return scope;
  if (matchup.groupLabel && round.toLowerCase().includes(matchup.groupLabel.toLowerCase())) return round;
  return `${scope} · ${round}`;
}

async function loadHistory(playerId: string, tournamentId: string, divisionFilter: { isPublic?: true }) {
  return prisma.game.findMany({
    where: {
      matchup: { tournamentId, division: divisionFilter },
      status: { in: ["LIVE", "INTERRUPTED", "COMPLETED", "FORFEITED"] },
      OR: [
        { homePair: { OR: [{ playerAId: playerId }, { playerBId: playerId }] } },
        { awayPair: { OR: [{ playerAId: playerId }, { playerBId: playerId }] } },
      ],
    },
    include: {
      matchup: { include: { division: true } },
      homeTeam: true,
      awayTeam: true,
      homePair: { include: { playerA: true, playerB: true } },
      awayPair: { include: { playerA: true, playerB: true } },
    },
    orderBy: [{ completedAt: { sort: "desc", nulls: "first" } }, { startedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
  });
}

function sideFor(game: HistoryGame, playerId: string) {
  const home = game.homePair.playerAId === playerId || game.homePair.playerBId === playerId;
  const pair = home ? game.homePair : game.awayPair;
  const opponentPair = home ? game.awayPair : game.homePair;
  const team = home ? game.homeTeam : game.awayTeam;
  const opponentTeam = home ? game.awayTeam : game.homeTeam;
  const score = home ? game.homeScore : game.awayScore;
  const opponentScore = home ? game.awayScore : game.homeScore;
  const partner = pair.playerAId === playerId ? pair.playerB : pair.playerA;
  const decided = game.status === "COMPLETED" || game.status === "FORFEITED";
  return {
    home,
    pair,
    opponentPair,
    team,
    opponentTeam,
    score,
    opponentScore,
    partner,
    result: decided ? (score > opponentScore ? "W" : "L") : null,
  };
}

function PairLinks({ pair }: { pair: HistoryGame["homePair"] }) {
  const players = [pair.playerA, pair.playerB];
  return <span className="inline-flex flex-wrap items-center gap-x-1">{players.map((player, index) => <span key={player.id} className="contents">{index > 0 && <span className="text-gray-400">/</span>}<Link href={`/players/${player.id}`} className="font-bold text-ink hover:text-court hover:underline">{formatPlayerCompactName(player)}</Link></span>)}</span>;
}

export default async function PublicPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const divisionFilter = await publicDivisionFilter();
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  if (!tournament) notFound();

  const player = await prisma.player.findFirst({
    where: {
      id,
      tournamentId: tournament.id,
      isActive: true,
      participationStatus: "CONFIRMED",
      OR: [
        { divisionEntries: { some: { status: "CONFIRMED", division: divisionFilter } } },
        { team: { division: divisionFilter } },
      ],
    },
    include: {
      team: { include: { division: true, group: true } },
      divisionEntries: { where: { status: "CONFIRMED", division: divisionFilter }, include: { division: true } },
    },
  });
  if (!player) notFound();

  const history = await loadHistory(player.id, tournament.id, divisionFilter);
  const decided = history.filter((game) => game.status === "COMPLETED" || game.status === "FORFEITED");
  const summary = decided.reduce((acc, game) => {
    const side = sideFor(game, player.id);
    acc.pointsFor += side.score;
    acc.pointsAgainst += side.opponentScore;
    if (side.result === "W") acc.wins += 1;
    if (side.result === "L") acc.losses += 1;
    return acc;
  }, { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 });
  const npd = summary.pointsFor - summary.pointsAgainst;
  const teamIsPublic = Boolean(player.team && (player.team.division.isPublic || !("isPublic" in divisionFilter)));
  const divisionNames = player.divisionEntries.map((entry) => entry.division.name).join(" · ");
  const branding = getTeamBranding(teamIsPublic ? player.team : null);

  return <main className="public-page mx-auto max-w-6xl px-4 py-6 md:py-10">
    <Link href="/players" className="text-sm font-bold text-court hover:text-ink">← Back to players</Link>

    <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="relative isolate overflow-hidden px-5 py-6 md:px-8 md:py-8" style={teamHeroStyle(teamIsPublic ? player.team : null)}>
        {teamIsPublic && player.team && <TeamHeroArtwork team={player.team}/>}<div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/15 via-transparent to-black/10"/>
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center">
          {player.avatarUrl ? <a href={player.avatarUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${formatPlayerDisplayName(player)} profile photo`} className="w-fit rounded-full bg-white/10 p-1 transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"><PlayerAvatar {...player} team={teamIsPublic ? player.team : null} size="xl"/></a> : <div className="w-fit rounded-full bg-white/10 p-1"><PlayerAvatar {...player} team={teamIsPublic ? player.team : null} size="xl"/></div>}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold uppercase tracking-[.18em] opacity-[.85]">Player profile</div>
            <div className="mt-1 flex items-center gap-2"><h1 className="text-3xl font-black tracking-tight md:text-5xl">{formatPlayerDisplayName(player)}</h1><GenderIndicator sex={player.sex} className="text-3xl md:text-4xl"/></div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold opacity-90">
              {teamIsPublic && player.team && <TeamIdentity team={player.team} variant="compact"/>}
            </div>
            {divisionNames && <div className="mt-2 text-xs font-semibold opacity-75">{divisionNames}{teamIsPublic && player.team?.group ? ` · ${player.team.group.name}` : ""}</div>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0">
        <Stat label="Played" value={decided.length}/>
        <Stat label="Record" value={`${summary.wins}-${summary.losses}`} tone={summary.wins > summary.losses ? "positive" : summary.losses > summary.wins ? "negative" : "neutral"}/>
        <Stat label="NPD" value={`${npd > 0 ? "+" : ""}${npd}`} tone={npd > 0 ? "positive" : npd < 0 ? "negative" : "neutral"}/>
        <Stat label="Total points" value={summary.pointsFor}/>
      </div>
    </section>

    <section className="mt-8">
      <div className="mb-4"><div className="public-kicker">On-court record</div><h2 className="text-2xl font-black tracking-tight md:text-3xl">Match history</h2><p className="mt-1 text-sm text-gray-500">Completed appearances plus any match currently in progress.</p></div>
      {history.length ? <div className="space-y-3">{history.map((game) => {
        const side = sideFor(game, player.id);
        return <article key={game.id} className={`group rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${side.result === "W" ? "border-emerald-200 hover:border-emerald-400" : side.result === "L" ? "border-red-200 hover:border-red-300" : "border-line hover:border-court/40"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><Link href={`/matches/${game.matchupId}`} className="text-[10px] font-extrabold uppercase tracking-widest text-court hover:text-ink">{game.matchup.division.name} · {matchupContext(game.matchup)} · Match {game.gameNumber}</Link>{game.matchup.courtLabel && <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Court {game.matchup.courtLabel}</span>}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-base font-black"><TeamLogo team={side.team} variant="compact"/><Link href={`/teams/${side.team.id}`} className="hover:text-court">{side.team.shortName}</Link><span className="text-gray-300">vs</span><TeamLogo team={side.opponentTeam} variant="compact"/><Link href={`/teams/${side.opponentTeam.id}`} className="hover:text-court">{side.opponentTeam.shortName}</Link></div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-gray-500">With <Link href={`/players/${side.partner.id}`} className="font-bold text-ink hover:text-court hover:underline">{formatPlayerCompactName(side.partner)}</Link><span>· Opponents</span><PairLinks pair={side.opponentPair}/></div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={game.status} compact/>
              <Link href={`/matches/${game.matchupId}`} aria-label={`Open match ${game.gameNumber}`} className="rounded-lg text-right hover:bg-paper"><div className={`text-2xl font-black tabular-nums ${side.result === "W" ? "text-emerald-700" : side.result === "L" ? "text-red-700" : "text-ink"}`}>{side.score}–{side.opponentScore}</div>{side.result && <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">{side.result === "W" ? "Win" : "Loss"}</div>}</Link>
            </div>
          </div>
        </article>;
      })}</div> : <div className="public-empty">No recorded match appearances yet.</div>}
    </section>
  </main>;
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "positive" | "negative" }) {
  const valueTone = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-red-700" : "text-ink";
  return <div className="px-4 py-4 text-center md:px-6 md:py-5"><div className={`text-2xl font-black md:text-3xl ${valueTone}`}>{value}</div><div className="mt-1 text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{label}</div></div>;
}
