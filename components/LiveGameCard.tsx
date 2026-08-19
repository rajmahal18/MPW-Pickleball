import Link from "next/link";
import ScoreBadge from "./ScoreBadge";
import PlayerAvatar from "@/components/PlayerAvatar";
import { formatPlayerCompactName, type PlayerNameParts } from "@/lib/player-name";
import StatusBadge from "@/components/StatusBadge";
import { TeamLogo } from "@/components/TeamIdentity";
import type { TeamBrandingSource } from "@/lib/team-branding";

type Player = PlayerNameParts & { id: string; avatarUrl?: string | null };
export type LiveGame = {
  id: string;
  matchupId: string;
  gameNumber: number;
  homeScore: number;
  awayScore: number;
  status: string;
  winnerTeamId: string | null;
  matchup: { courtLabel: string | null; roundLabel: string };
  homeTeam: TeamBrandingSource & { id: string; name: string; shortName: string };
  awayTeam: TeamBrandingSource & { id: string; name: string; shortName: string };
  homePair: { id: string; playerA: Player; playerB: Player };
  awayPair: { id: string; playerA: Player; playerB: Player };
};

function PairIdentity({ pair, team, right = false }: { pair: LiveGame["homePair"] | LiveGame["awayPair"]; team: LiveGame["homeTeam"]; right?: boolean }) {
  const players = [pair.playerA, pair.playerB];
  return <div className={`flex min-w-0 flex-col gap-1.5 ${right ? "items-end text-right" : "items-start"}`}>
    <div className="flex -space-x-2">{players.map((player) => <Link key={player.id} href={`/players/${player.id}`} aria-label={`View ${formatPlayerCompactName(player)}`} className="rounded-full transition hover:z-10 hover:ring-2 hover:ring-court/30"><PlayerAvatar {...player} team={team} size="sm"/></Link>)}</div>
    <Link href={`/teams/${team.id}`} className="label flex items-center gap-1 truncate hover:text-court"><TeamLogo team={team} size="xs"/>{team.shortName}</Link>
    <div className={`flex flex-wrap items-center gap-x-1 text-xs font-black leading-snug sm:text-sm ${right ? "justify-end" : "justify-start"}`}>
      {players.map((player, index) => <span key={player.id} className="contents">{index > 0 && <span className="text-gray-400">/</span>}<Link href={`/players/${player.id}`} className="hover:text-court hover:underline">{formatPlayerCompactName(player)}</Link></span>)}
    </div>
  </div>;
}

export default function LiveGameCard({ game }: { game: LiveGame }) {
  return <article className="panel overflow-hidden transition hover:border-court">
    <div className="flex items-center justify-between gap-2 border-b border-line bg-court/10 px-3 py-2 sm:px-4">
      <Link href={`/matches/${game.matchupId}`} className="label text-court hover:text-ink">Court {game.matchup.courtLabel || "TBA"} · Match {game.gameNumber}</Link>
      <Link href={`/matches/${game.matchupId}`} className="truncate text-[10px] font-bold hover:text-court sm:text-xs">{game.matchup.roundLabel}</Link>
    </div>

    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 p-3 md:gap-4 md:p-4">
      <PairIdentity pair={game.homePair} team={game.homeTeam}/>
      <Link href={`/matches/${game.matchupId}`} className="flex flex-col items-center gap-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-court/30" aria-label={`Open match ${game.gameNumber}`}>
        <ScoreBadge home={game.homeScore} away={game.awayScore} status={game.status}/>
        <StatusBadge status={game.status} compact/>
      </Link>
      <PairIdentity pair={game.awayPair} team={game.awayTeam} right/>
    </div>
  </article>;
}
