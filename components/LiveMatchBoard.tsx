"use client";

import { useEffect, useState } from "react";
import PlayerAvatar from "@/components/PlayerAvatar";
import ScoreBadge from "@/components/ScoreBadge";
import { formatPlayerDisplayName, type PlayerNameParts } from "@/lib/player-name";
import StatusBadge from "@/components/StatusBadge";

type Player = PlayerNameParts & { id: string; avatarUrl?: string | null };
type Team = { id: string; name?: string; shortName: string };
type Game = {
  id: string;
  gameNumber: number;
  homeScore: number;
  awayScore: number;
  status: string;
  winnerTeamId: string | null;
  homeTeam: Team;
  awayTeam: Team;
  homePair: { id: string; playerA: Player; playerB: Player };
  awayPair: { id: string; playerA: Player; playerB: Player };
};
type Matchup = {
  id: string;
  status: string;
  homeWins: number;
  awayWins: number;
  winnerTeamId: string | null;
  gamesPerMatchup: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeam: { id: string; name: string; shortName: string } | null;
  awayTeam: { id: string; name: string; shortName: string } | null;
  games: Game[];
};

export default function LiveMatchBoard({ initial }: { initial: Matchup }) {
  const [matchup, setMatchup] = useState(initial);
  const [connection, setConnection] = useState<"live" | "stale">("live");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      if (stopped) return;
      if (document.visibilityState !== "visible") {
        timer = setTimeout(load, 2500);
        return;
      }
      try {
        const response = await fetch(`/api/public/matchups/${initial.id}`, { cache: "no-store" });
        if (!response.ok) throw new Error("refresh failed");
        const next = await response.json() as Matchup;
        if (!stopped) {
          setMatchup(next);
          setConnection("live");
        }
      } catch {
        if (!stopped) setConnection("stale");
      } finally {
        if (!stopped) timer = setTimeout(load, 2500);
      }
    };
    timer = setTimeout(load, 2500);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [initial.id]);

  return <>
    <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr]">
      <TeamPanel team={matchup.homeTeam} wins={matchup.homeWins} winner={matchup.winnerTeamId === matchup.homeTeamId}/>
      <div className="grid place-items-center gap-1 text-center text-sm font-black text-gray-400"><span>TEAM MATCHUP</span><span className={`text-[10px] uppercase tracking-widest ${connection === "live" ? "text-court" : "text-amber-700"}`}>{connection === "live" ? "Live updates" : "Reconnecting"}</span></div>
      <TeamPanel team={matchup.awayTeam} wins={matchup.awayWins} winner={matchup.winnerTeamId === matchup.awayTeamId}/>
    </div>
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="label">{matchup.gamesPerMatchup} pair game{matchup.gamesPerMatchup === 1 ? "" : "s"}</div><h2 className="text-2xl font-black uppercase">Game board</h2></div><StatusBadge status={matchup.status}/></div>
      {matchup.games.length ? <div className="mt-4 space-y-3">{matchup.games.map((game) => <article key={game.id} className={`panel grid gap-4 p-4 md:grid-cols-[92px_1fr_auto_1fr] md:items-center ${game.status === "LIVE" ? "border-flame bg-flame/5" : game.status === "COMPLETED" || game.status === "FORFEITED" ? "bg-gray-50/60" : ""}`}>
        <div><div className="label">Game {game.gameNumber}</div><div className="mt-1"><StatusBadge status={game.status} compact/></div></div>
        <PairView players={[game.homePair.playerA, game.homePair.playerB]} team={game.homeTeam.shortName}/>
        <div className="justify-self-center"><ScoreBadge home={game.homeScore} away={game.awayScore} status={game.status}/></div>
        <PairView players={[game.awayPair.playerA, game.awayPair.playerB]} team={game.awayTeam.shortName} right/>
      </article>)}</div> : <div className="panel mt-4 p-10 text-center text-gray-500">Games appear after both sides submit complete lineups.</div>}
    </section>
  </>;
}

function TeamPanel({ team, wins, winner }: { team: Matchup["homeTeam"]; wins: number; winner: boolean }) {
  return <div className={`panel p-5 text-center ${winner ? "border-gold bg-gold/15" : ""}`}><div className="label">{winner ? "Winner" : "Team"}</div><div className="mt-1 text-2xl font-black">{team?.name || "TBD"}</div><div className="mt-3 text-5xl font-black tabular-nums">{wins}</div></div>;
}
function PairView({ players, team, right }: { players: Player[]; team: string; right?: boolean }) {
  return <div className={`flex items-center gap-3 ${right ? "md:flex-row-reverse md:text-right" : ""}`}><div className="flex -space-x-2">{players.map((player) => <PlayerAvatar key={player.id} {...player} size="sm"/>)}</div><div><div className="label">{team}</div><div className="font-black">{players.map((player) => formatPlayerDisplayName(player)).join(" / ")}</div></div></div>;
}
