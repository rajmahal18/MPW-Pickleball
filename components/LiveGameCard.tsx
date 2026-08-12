import Link from "next/link";
import ScoreBadge from "./ScoreBadge";
import PlayerAvatar from "@/components/PlayerAvatar";
import { formatPlayerDisplayName, type PlayerNameParts } from "@/lib/player-name";
import StatusBadge from "@/components/StatusBadge";

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
  homeTeam: { id: string; shortName: string };
  awayTeam: { id: string; shortName: string };
  homePair: { id: string; playerA: Player; playerB: Player };
  awayPair: { id: string; playerA: Player; playerB: Player };
};

function pairName(pair: LiveGame["homePair"] | LiveGame["awayPair"]) {
  return `${formatPlayerDisplayName(pair.playerA)} / ${formatPlayerDisplayName(pair.playerB)}`;
}

function PairIdentity({ pair, team, right = false }: { pair: LiveGame["homePair"] | LiveGame["awayPair"]; team: string; right?: boolean }) {
  return <div className={`flex min-w-0 flex-col gap-1.5 ${right ? "items-end text-right" : "items-start"}`}>
    <div className="flex -space-x-2" aria-hidden="true"><PlayerAvatar {...pair.playerA} size="sm"/><PlayerAvatar {...pair.playerB} size="sm"/></div>
    <div className="label truncate">{team}</div>
    <div className="line-clamp-2 text-xs font-black leading-snug sm:text-sm">{pairName(pair)}</div>
  </div>;
}

export default function LiveGameCard({ game }: { game: LiveGame }) {
  return <Link href={`/matches/${game.matchupId}`} className="panel block overflow-hidden hover:border-court">
    <div className="flex items-center justify-between gap-2 border-b border-line bg-court/10 px-3 py-2 sm:px-4">
      <span className="label text-court">Court {game.matchup.courtLabel || "TBA"} · Match {game.gameNumber}</span>
      <span className="truncate text-[10px] font-bold sm:text-xs">{game.matchup.roundLabel}</span>
    </div>

    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 p-3 md:gap-4 md:p-4">
      <PairIdentity pair={game.homePair} team={game.homeTeam.shortName}/>
      <div className="flex flex-col items-center gap-1.5">
        <ScoreBadge home={game.homeScore} away={game.awayScore} status={game.status}/>
        <StatusBadge status={game.status} compact/>
      </div>
      <PairIdentity pair={game.awayPair} team={game.awayTeam.shortName} right/>
    </div>
  </Link>;
}
