import Link from "next/link";
import ScoreBadge from "./ScoreBadge";
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

export default function LiveGameCard({ game }: { game: LiveGame }) {
  return <Link href={`/matches/${game.matchupId}`} className="panel block overflow-hidden hover:border-court">
    <div className="flex items-center justify-between border-b border-line bg-court/10 px-4 py-2"><span className="label text-court">Court {game.matchup.courtLabel || "TBA"} · Game {game.gameNumber}</span><span className="text-xs font-bold">{game.matchup.roundLabel}</span></div>
    <div className="border-b border-line bg-white px-4 py-2"><StatusBadge status={game.status} compact/></div>
    <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
      <div><div className="label">{game.homeTeam.shortName}</div><div className="font-black">{formatPlayerDisplayName(game.homePair.playerA)} / {formatPlayerDisplayName(game.homePair.playerB)}</div></div>
      <ScoreBadge home={game.homeScore} away={game.awayScore} status={game.status}/>
      <div className="md:text-right"><div className="label">{game.awayTeam.shortName}</div><div className="font-black">{formatPlayerDisplayName(game.awayPair.playerA)} / {formatPlayerDisplayName(game.awayPair.playerB)}</div></div>
    </div>
  </Link>;
}
