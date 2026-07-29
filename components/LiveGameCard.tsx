"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ScoreBadge from "./ScoreBadge";

export default function LiveGameCard({ initial }: { initial:any }) {
  const [game,setGame]=useState(initial);
  useEffect(()=>{ const t=setInterval(async()=>{ const r=await fetch(`/api/public/games/${initial.id}`,{cache:"no-store"}); if(r.ok)setGame(await r.json()); },2000); return()=>clearInterval(t);},[initial.id]);
  return <Link href={`/matches/${game.matchupId}`} className="panel block overflow-hidden hover:border-court">
    <div className="flex items-center justify-between border-b border-line bg-emerald-50 px-4 py-2"><span className="label text-court">Court {game.matchup.courtLabel || "TBA"} · Game {game.gameNumber}</span><span className="text-xs font-bold">{game.matchup.roundLabel}</span></div>
    <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
      <div><div className="label">{game.homeTeam.shortName}</div><div className="font-black">{game.homePair.playerA.firstName} / {game.homePair.playerB.firstName}</div></div>
      <ScoreBadge home={game.homeScore} away={game.awayScore} status={game.status}/>
      <div className="md:text-right"><div className="label">{game.awayTeam.shortName}</div><div className="font-black">{game.awayPair.playerA.firstName} / {game.awayPair.playerB.firstName}</div></div>
    </div>
  </Link>
}
