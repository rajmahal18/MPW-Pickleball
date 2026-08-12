"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import PlayerAvatar from "@/components/PlayerAvatar";
import { formatPlayerDisplayName, type PlayerNameParts } from "@/lib/player-name";
import StatusBadge from "@/components/StatusBadge";

type Team = { id: string; name: string; shortName: string };
type Player = PlayerNameParts & { id: string; avatarUrl?: string | null };
type Pair = { id: string; label: string; playerA: Player; playerB: Player };
type GameState = {
  id: string;
  version: number;
  gameNumber: number;
  homeScore: number;
  awayScore: number;
  status: string;
  winnerTeamId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  homeTeam: Team;
  awayTeam: Team;
  homePair: Pair;
  awayPair: Pair;
  matchup: {
    id: string;
    status: string;
    homeWins: number;
    awayWins: number;
    roundLabel: string;
    courtLabel: string | null;
    suddenDeathAtTen: boolean;
  };
};

type ApiResponse = { ok: true; game: GameState; message?: string } | { ok: false; error: string };

function pairName(pair: Pair) {
  return `${formatPlayerDisplayName(pair.playerA)} / ${formatPlayerDisplayName(pair.playerB)}`;
}

export default function AdminScoreConsole({ initial }: { initial: GameState }) {
  const [game, setGame] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correction, setCorrection] = useState({ home: String(initial.homeScore), away: String(initial.awayScore), reason: "" });
  const busyRef = useRef(false);

  const terminal = game.status === "COMPLETED" || game.status === "FORFEITED";
  const rule = game.matchup.suddenDeathAtTen ? "Sudden death at 10-10" : "Win by 2";
  const winner = useMemo(() => game.winnerTeamId, [game.winnerTeamId]);

  async function mutate(action: string, extra: Record<string, unknown> = {}) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);

    const before = game;
    if (action === "increment-home") setGame((current) => ({ ...current, homeScore: current.homeScore + 1, status: "LIVE" }));
    if (action === "increment-away") setGame((current) => ({ ...current, awayScore: current.awayScore + 1, status: "LIVE" }));
    if (action === "decrement-home") setGame((current) => ({ ...current, homeScore: Math.max(0, current.homeScore - 1), status: "LIVE" }));
    if (action === "decrement-away") setGame((current) => ({ ...current, awayScore: Math.max(0, current.awayScore - 1), status: "LIVE" }));

    try {
      const response = await fetch(`/api/admin/score/${game.id}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ action, version: before.version, ...extra }),
      });
      const payload = await response.json() as ApiResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.ok ? "Score update failed." : payload.error);
      setGame(payload.game);
      setCorrection((current) => ({ ...current, home: String(payload.game.homeScore), away: String(payload.game.awayScore) }));
      setNotice(payload.message || "Saved");
      window.setTimeout(() => setNotice(null), 1800);
      return true;
    } catch (cause) {
      setGame(before);
      setError(cause instanceof Error ? cause.message : "Score update failed.");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const homeScore = Number(correction.home);
    const awayScore = Number(correction.away);
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      setError("Scores must be non-negative whole numbers.");
      return;
    }
    const saved = await mutate("set-score", { homeScore, awayScore, reason: correction.reason });
    if (saved) setCorrection((current) => ({ ...current, reason: "" }));
  }

  return <>
    <div className="mt-4 flex min-h-7 items-center gap-3 text-sm" aria-live="polite">
      {busy && <span className="font-bold text-court">Saving…</span>}
      {!busy && notice && <span className="font-bold text-court">✓ {notice}</span>}
      {error && <span className="font-bold text-red-700">{error}</span>}
      {!busy && !notice && !error && <span className="text-gray-500">Score changes save in place — no page reload.</span>}
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-5">
      <ScoreSide team={game.homeTeam} pair={game.homePair} score={game.homeScore} winner={winner === game.homeTeam.id} disabled={busy || terminal} onMinus={() => void mutate("decrement-home")} onPlus={() => void mutate("increment-home")} />
      <ScoreSide team={game.awayTeam} pair={game.awayPair} score={game.awayScore} winner={winner === game.awayTeam.id} disabled={busy || terminal} onMinus={() => void mutate("decrement-away")} onPlus={() => void mutate("increment-away")} />
    </div>

    <div className="mt-5 space-y-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:space-y-0">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {!terminal && game.status !== "LIVE" && <button type="button" disabled={busy} onClick={() => void mutate("start")} className="btn-primary justify-center disabled:opacity-50">Start live</button>}
        {!terminal && <button type="button" disabled={busy} onClick={() => void mutate("finalize")} className="btn justify-center border-red-600 bg-red-600 text-white disabled:opacity-50">Finalize</button>}
        {terminal && <button type="button" disabled={busy} onClick={() => void mutate("reopen")} className="btn-ghost col-span-2 justify-center disabled:opacity-50">Reopen for correction</button>}
        {!terminal && <button type="button" disabled={busy} onClick={() => void mutate("interrupt")} className="btn-ghost justify-center disabled:opacity-50">Interrupt</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto"><StatusBadge status={game.status} compact/><span className="border border-line bg-white px-3 py-2 text-xs font-bold text-gray-600">Series <strong className="text-ink">{game.matchup.homeWins}-{game.matchup.awayWins}</strong> · {rule}</span></div>
    </div>

    <section className="panel mt-6 p-4 sm:p-5">
      <h2 className="text-lg font-black uppercase sm:text-xl">Exact score entry / correction</h2>
      <p className="mt-1 text-sm text-gray-500">Use this for fast manual encoding or correction. Completed-match corrections recalculate standings and bracket progression automatically.</p>
      <form onSubmit={submitCorrection} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
        <input type="number" min="0" value={correction.home} onChange={(event) => setCorrection((current) => ({ ...current, home: event.target.value }))} className="border border-line p-3" aria-label={`${game.homeTeam.name} score`} />
        <input type="number" min="0" value={correction.away} onChange={(event) => setCorrection((current) => ({ ...current, away: event.target.value }))} className="border border-line p-3" aria-label={`${game.awayTeam.name} score`} />
        <input value={correction.reason} onChange={(event) => setCorrection((current) => ({ ...current, reason: event.target.value }))} placeholder={terminal ? "Reason for correction" : "Optional note"} required={terminal} className="border border-line p-3" />
        <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">Save score</button>
      </form>
    </section>

    <section className="panel mt-6 p-4 sm:p-5">
      <h2 className="text-lg font-black uppercase sm:text-xl">Forfeit / default</h2>
      <p className="mt-1 text-sm text-gray-500">Use only when the organizer officially declares a default or forfeit. This immediately decides the match.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy || terminal} onClick={() => void mutate("forfeit-home")} className="btn-ghost disabled:opacity-50">{game.homeTeam.shortName} forfeits</button>
        <button type="button" disabled={busy || terminal} onClick={() => void mutate("forfeit-away")} className="btn-ghost disabled:opacity-50">{game.awayTeam.shortName} forfeits</button>
      </div>
    </section>
  </>;
}

function ScoreSide({ team, pair, score, winner, disabled, onMinus, onPlus }: { team: Team; pair: Pair; score: number; winner: boolean; disabled: boolean; onMinus: () => void; onPlus: () => void }) {
  return <div className={`panel min-w-0 p-3 text-center sm:p-5 ${winner ? "border-gold bg-gold/10" : ""}`}>
    <div className="truncate text-[10px] font-black uppercase tracking-wide text-gray-500 sm:text-xs">{team.shortName || team.name}</div>
    <div className="mt-3 flex justify-center -space-x-2"><PlayerAvatar {...pair.playerA} size="md"/><PlayerAvatar {...pair.playerB} size="md"/></div>
    <div className="mt-1 line-clamp-2 min-h-8 text-[11px] font-black leading-tight sm:mt-2 sm:min-h-0 sm:text-base">{pairName(pair)}</div>
    <div className="my-3 text-5xl font-black tabular-nums sm:my-5 sm:text-7xl">{score}</div>
    <div className="grid grid-cols-[48px_1fr] gap-1.5 sm:grid-cols-[90px_1fr] sm:gap-2">
      <button type="button" disabled={disabled || score === 0} onClick={onMinus} className="btn-ghost justify-center px-2 text-lg disabled:opacity-35 sm:text-2xl" aria-label={`Subtract one point from ${team.name}`}>−1</button>
      <button type="button" disabled={disabled} onClick={onPlus} className="btn-primary justify-center px-2 text-base disabled:opacity-50 sm:text-lg" aria-label={`Add one point to ${team.name}`}><span className="sm:hidden">+1</span><span className="hidden sm:inline">+1 POINT</span></button>
    </div>
  </div>;
}
