"use client";

import { useEffect, useState } from "react";
import PlayerAvatar from "@/components/PlayerAvatar";
import ScoreBadge from "@/components/ScoreBadge";
import { formatPlayerCompactName, type PlayerNameParts } from "@/lib/player-name";
import { scoreRuleForStage, winsNeededForMatchup } from "@/lib/tournament/rules";
import type { MatchupStage } from "@prisma/client";
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
  stage: MatchupStage;
  suddenDeathAtTen: boolean;
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

  const winsNeeded = winsNeededForMatchup(matchup.stage, matchup.gamesPerMatchup);
  const seriesClinched = winsNeeded !== null && matchup.status === "COMPLETED" && Boolean(matchup.winnerTeamId);
  const scoringRule = scoreRuleForStage(matchup.stage, matchup.suddenDeathAtTen).label;

  return <>
    <div className="panel mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 p-4 text-center md:hidden">
      <div className="min-w-0"><div className="label">{matchup.homeTeam?.shortName || "TBD"}</div><div className="truncate text-sm font-black">{matchup.homeTeam?.name || "TBD"}</div></div>
      <div><div className="text-4xl font-black tabular-nums">{matchup.homeWins}-{matchup.awayWins}</div><div className={`text-[9px] font-black uppercase tracking-widest ${connection === "live" ? "text-court" : "text-amber-700"}`}>{connection === "live" ? "Live updates" : "Reconnecting"}</div></div>
      <div className="min-w-0"><div className="label">{matchup.awayTeam?.shortName || "TBD"}</div><div className="truncate text-sm font-black">{matchup.awayTeam?.name || "TBD"}</div></div>
    </div>
    <div className="mt-5 hidden gap-4 md:grid md:grid-cols-[1fr_auto_1fr]">
      <TeamPanel team={matchup.homeTeam} wins={matchup.homeWins} winner={matchup.winnerTeamId === matchup.homeTeamId}/>
      <div className="grid place-items-center gap-1 text-center text-sm font-black text-gray-400"><span>TEAM MATCHUP</span><span className={`text-[10px] uppercase tracking-widest ${connection === "live" ? "text-court" : "text-amber-700"}`}>{connection === "live" ? "Live updates" : "Reconnecting"}</span></div>
      <TeamPanel team={matchup.awayTeam} wins={matchup.awayWins} winner={matchup.winnerTeamId === matchup.awayTeamId}/>
    </div>
    <section className="mt-6 md:mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="label">{winsNeeded ? `Best of ${matchup.gamesPerMatchup} · first to ${winsNeeded}` : `${matchup.gamesPerMatchup} pair match${matchup.gamesPerMatchup === 1 ? "" : "es"}`}</div><h2 className="text-xl font-black uppercase md:text-2xl">Match board</h2><p className="mt-1 text-xs font-semibold text-gray-500">{scoringRule}</p></div><StatusBadge status={matchup.status}/></div>
      {matchup.games.length ? <div className="mt-4 space-y-3">{matchup.games.map((game) => {
        const notNeeded = seriesClinched && game.status === "SCHEDULED" && game.homeScore === 0 && game.awayScore === 0;
        return <article key={game.id} className={`panel p-3 md:grid md:grid-cols-[92px_1fr_auto_1fr] md:items-center md:gap-4 md:p-4 ${notNeeded ? "bg-gray-50 opacity-65" : game.status === "LIVE" ? "border-flame bg-flame/5" : game.status === "COMPLETED" || game.status === "FORFEITED" ? "bg-gray-50/60" : ""}`}>
        <div className="mb-3 flex items-center justify-between md:mb-0 md:block"><div className="label">Match {game.gameNumber}</div><div className="md:mt-1">{notNeeded ? <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Not needed</span> : <StatusBadge status={game.status} compact/>}</div></div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:contents">
          <div className="min-w-0"><PairView players={[game.homePair.playerA, game.homePair.playerB]} team={game.homeTeam.shortName}/></div>
          <div className="justify-self-center">{notNeeded ? <span className="grid h-11 min-w-20 place-items-center rounded-lg border border-line bg-white text-lg font-black text-gray-300">—</span> : <ScoreBadge home={game.homeScore} away={game.awayScore} status={game.status}/>}</div>
          <div className="min-w-0"><PairView players={[game.awayPair.playerA, game.awayPair.playerB]} team={game.awayTeam.shortName} right/></div>
        </div>
      </article>;
      })}</div> : <div className="panel mt-4 p-8 text-center text-sm text-gray-500">Matches appear after both sides submit complete lineups.</div>}
    </section>
  </>;
}

function TeamPanel({ team, wins, winner }: { team: Matchup["homeTeam"]; wins: number; winner: boolean }) {
  return <div className={`panel p-5 text-center ${winner ? "border-gold bg-gold/15" : ""}`}><div className="label">{winner ? "Winner" : "Team"}</div><div className="mt-1 text-2xl font-black">{team?.name || "TBD"}</div><div className="mt-3 text-5xl font-black tabular-nums">{wins}</div></div>;
}
function PairView({ players, team, right }: { players: Player[]; team: string; right?: boolean }) {
  return <div className={`flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-3 ${right ? "items-end text-right md:flex-row-reverse" : "items-start"}`}>
    <div className="flex -space-x-3">{players.map((player) => <PlayerAvatar key={player.id} {...player} size="md"/>)}</div>
    <div className="min-w-0"><div className="label">{team}</div><div className="line-clamp-2 text-xs font-black leading-snug md:text-base">{players.map((player) => formatPlayerCompactName(player)).join(" / ")}</div></div>
  </div>;
}
