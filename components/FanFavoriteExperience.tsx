"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Copy, Crown, Heart, Ticket, Trophy, Users, Vote } from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";
import GenderIndicator from "@/components/GenderIndicator";
import { FAN_FAVORITE_CLOSED_POLL_INTERVAL_MS, FAN_FAVORITE_CODE_POLL_INTERVAL_MS, FAN_FAVORITE_POLL_INTERVAL_MS, FAN_FAVORITE_VOTE_COOLDOWN_SECONDS, PUBLIC_POLL_JITTER_RATIO } from "@/lib/tournament/config";
import { formatPlayerDisplayName } from "@/lib/player-name";
import { PickleballPosterDecor, TournamentPosterBrand } from "@/components/TournamentPosterBrand";
import type { PublicVotingCodeSnapshot } from "@/lib/tournament/fan-favorite-codes";
import { TeamIdentity } from "@/components/TeamIdentity";
import { teamCardStyle } from "@/lib/team-branding";

export type FanFavoritePlayer = {
  id: string;
  firstName: string;
  middleInitial?: string | null;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  sex: "MALE" | "FEMALE";
  team: { id: string; name: string; shortName: string; logoUrl: string | null; brandingPrimary: string | null; brandingSecondary: string | null; brandingAccent: string | null; brandingText: string | null; brandingSurface: string | null } | null;
};

type Player = FanFavoritePlayer;
export type FanFavoriteRanking = { rank: number; votes: number; percentage: number; player?: Player };
export type FanFavoriteTeamSupport = { team: NonNullable<FanFavoritePlayer["team"]>; votes: number; percentage: number; maleVotes: number; femaleVotes: number };
type Ranking = FanFavoriteRanking;
export type FanFavoriteSnapshot = {
  votingOpen: boolean;
  votingDeadline: string | null;
  totalVotes: number;
  totalsBySex: { male: number; female: number };
  rankingsBySex: { male: Ranking[]; female: Ranking[] };
  teamSupport: FanFavoriteTeamSupport[];
  updatedAt: string;
};

export default function FanFavoriteExperience({ players, initialCode = "", initialSnapshot, initialCodeSnapshot }: { players: Player[]; initialCode?: string; initialSnapshot?: FanFavoriteSnapshot; initialCodeSnapshot?: PublicVotingCodeSnapshot }) {
  const malePlayers = useMemo(() => players.filter((player) => player.sex === "MALE"), [players]);
  const femalePlayers = useMemo(() => players.filter((player) => player.sex === "FEMALE"), [players]);
  const [snapshot, setSnapshot] = useState<FanFavoriteSnapshot>(initialSnapshot ?? { votingOpen: false, votingDeadline: null, totalVotes: 0, totalsBySex: { male: 0, female: 0 }, rankingsBySex: { male: [], female: [] }, teamSupport: [], updatedAt: new Date().toISOString() });
  const [activeTab, setActiveTab] = useState<"VOTE" | "CODES">("VOTE");
  const [selectedMaleId, setSelectedMaleId] = useState("");
  const [selectedFemaleId, setSelectedFemaleId] = useState("");
  const [code, setCode] = useState(initialCode);
  const [maleSearch, setMaleSearch] = useState("");
  const [femaleSearch, setFemaleSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [codeSnapshot, setCodeSnapshot] = useState<PublicVotingCodeSnapshot>(initialCodeSnapshot ?? { latestBatch: null, availableCodes: [], availableCount: 0, nextBatch: null, serverTime: new Date().toISOString() });
  const [codeClockOffset, setCodeClockOffset] = useState(0);
  const [codeTick, setCodeTick] = useState(Date.now());

  async function refresh(signal?: AbortSignal) {
    const response = await fetch("/api/public/fan-favorite/rankings", { cache: "no-store", signal });
    if (response.ok) setSnapshot(await response.json());
  }

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    const schedule = (baseDelay: number) => {
      if (stopped) return;
      if (timer) window.clearTimeout(timer);
      const jitter = baseDelay * PUBLIC_POLL_JITTER_RATIO * (Math.random() * 2 - 1);
      timer = window.setTimeout(run, Math.max(1500, Math.round(baseDelay + jitter)));
    };
    const run = async () => {
      if (stopped) return;
      if (document.visibilityState !== "visible") { schedule(FAN_FAVORITE_CLOSED_POLL_INTERVAL_MS); return; }
      controller?.abort();
      controller = new AbortController();
      try { await refresh(controller.signal); } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) { /* retry next poll */ }
      } finally {
        controller = null;
        schedule(snapshot.votingOpen ? FAN_FAVORITE_POLL_INTERVAL_MS : FAN_FAVORITE_CLOSED_POLL_INTERVAL_MS);
      }
    };
    schedule(FAN_FAVORITE_POLL_INTERVAL_MS);
    const onFocus = () => void run();
    window.addEventListener("focus", onFocus);
    return () => { stopped = true; if (timer) window.clearTimeout(timer); controller?.abort(); window.removeEventListener("focus", onFocus); };
  }, [snapshot.votingOpen]);

  useEffect(() => {
    setCodeClockOffset(new Date(codeSnapshot.serverTime).getTime() - Date.now());
  }, [codeSnapshot.serverTime]);

  useEffect(() => {
    const interval = window.setInterval(() => setCodeTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    const baseDelay = activeTab === "CODES" ? FAN_FAVORITE_CODE_POLL_INTERVAL_MS : Math.max(6000, FAN_FAVORITE_CODE_POLL_INTERVAL_MS);
    const schedule = () => {
      if (stopped) return;
      if (timer) window.clearTimeout(timer);
      const jitter = baseDelay * PUBLIC_POLL_JITTER_RATIO * (Math.random() * 2 - 1);
      timer = window.setTimeout(run, Math.max(1500, Math.round(baseDelay + jitter)));
    };
    const run = async () => {
      if (stopped) return;
      if (document.visibilityState !== "visible") { schedule(); return; }
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/public/fan-favorite/codes", { cache: "no-store", signal: controller.signal });
        if (response.ok) setCodeSnapshot(await response.json());
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) { /* retry on next poll */ }
      } finally {
        controller = null;
        schedule();
      }
    };
    void run();
    const onFocus = () => void run();
    window.addEventListener("focus", onFocus);
    return () => { stopped = true; if (timer) window.clearTimeout(timer); controller?.abort(); window.removeEventListener("focus", onFocus); };
  }, [activeTab]);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = window.setInterval(() => setCooldownRemaining((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldownRemaining]);

  function filterPlayers(list: Player[], search: string) {
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter((player) => `${formatPlayerDisplayName(player)} ${player.team?.name ?? "Unassigned"} ${player.team?.shortName ?? ""}`.toLowerCase().includes(query));
  }

  const filteredMale = useMemo(() => filterPlayers(malePlayers, maleSearch), [malePlayers, maleSearch]);
  const filteredFemale = useMemo(() => filterPlayers(femalePlayers, femaleSearch), [femalePlayers, femaleSearch]);
  const maleLeader = snapshot.rankingsBySex.male[0];
  const femaleLeader = snapshot.rankingsBySex.female[0];
  const selectedMale = malePlayers.find((player) => player.id === selectedMaleId);
  const selectedFemale = femalePlayers.find((player) => player.id === selectedFemaleId);
  const nextCodeDropMs = codeSnapshot.nextBatch ? new Date(codeSnapshot.nextBatch.releaseAt).getTime() - (codeTick + codeClockOffset) : null;
  const codeStatusLabel = codeSnapshot.availableCount > 0
    ? (codeSnapshot.nextBatch ? `Next ${countdown(nextCodeDropMs)}` : "Available now")
    : codeSnapshot.nextBatch ? `Next ${countdown(nextCodeDropMs)}` : "No codes available";

  async function submitVote(event: FormEvent) {
    event.preventDefault();
    setMessage(""); setError(""); setSubmitting(true);
    try {
      const response = await fetch("/api/public/fan-favorite/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ malePlayerId: selectedMaleId, femalePlayerId: selectedFemaleId, code }) });
      const payload = await response.json() as { error?: string; message?: string; retryAfterSeconds?: number; cooldownSeconds?: number };
      if (!response.ok) {
        if (response.status === 429 && payload.retryAfterSeconds) setCooldownRemaining(Math.max(1, Math.ceil(payload.retryAfterSeconds)));
        throw new Error(payload.error || "Vote failed.");
      }
      setMessage(payload.message || "Your Fan Favorite picks are in!");
      setCode("");
      setCooldownRemaining(payload.cooldownSeconds ?? FAN_FAVORITE_VOTE_COOLDOWN_SECONDS);
      setSnapshot((current) => ({ ...current, totalVotes: current.totalVotes + 2, totalsBySex: { male: current.totalsBySex.male + 1, female: current.totalsBySex.female + 1 }, updatedAt: new Date().toISOString() }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Vote failed."); }
    finally { setSubmitting(false); }
  }

  return <div className="space-y-6">
    <section className="fan-arena overflow-hidden rounded-2xl border border-ink/10 shadow-panel">
      <div className="relative grid gap-5 p-5 text-white md:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
        <PickleballPosterDecor side="left"/>
        <div className="relative z-10 max-w-2xl"><TournamentPosterBrand compact/><div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[.18em]">Fan Favorite voting</div><h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Fan Favorite</h2></div>
        <div className="relative z-10 flex items-center gap-3 lg:justify-end"><div className="rounded-2xl bg-white/10 px-4 py-3 text-center backdrop-blur"><div className="text-3xl font-black">{snapshot.totalVotes}</div><div className="text-[10px] font-black uppercase tracking-widest text-white/65">votes cast</div></div><div className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider ${snapshot.votingOpen ? "bg-gold text-ink" : "bg-white/15 text-white/70"}`}>{snapshot.votingOpen ? "Voting open" : "Voting closed"}</div></div>
        <div className="relative z-10 grid gap-3 sm:grid-cols-2 lg:col-span-2"><CrowdLeaderPoster ranking={maleLeader} label="Male leader" tone="male"/><CrowdLeaderPoster ranking={femaleLeader} label="Female leader" tone="female"/></div>
        <Heart className="absolute -right-6 -top-8 h-36 w-36 rotate-12 text-white/5" fill="currentColor"/><Trophy className="absolute -bottom-8 left-1/2 h-32 w-32 -rotate-12 text-gold/10"/>
      </div>
    </section>

    <nav className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-white p-1 shadow-sm" aria-label="Fan Favorite sections">
      <button type="button" onClick={() => setActiveTab("VOTE")} className={`flex min-h-14 flex-col items-center justify-center rounded-lg px-4 text-sm font-black ${activeTab === "VOTE" ? "bg-court text-white" : "text-gray-600 hover:bg-paper"}`}><span className="flex items-center gap-2"><Vote className="h-4 w-4"/> Vote</span><span className={`mt-0.5 text-[9px] font-bold ${activeTab === "VOTE" ? "text-white/60" : "text-gray-400"}`}>Cast ballot</span></button>
      <button type="button" onClick={() => setActiveTab("CODES")} className={`flex min-h-14 flex-col items-center justify-center rounded-lg px-2 text-sm font-black ${activeTab === "CODES" ? "bg-ink text-white" : "text-gray-600 hover:bg-paper"}`}><span className="flex items-center gap-2"><Ticket className="h-4 w-4"/><span>Codes</span>{codeSnapshot.availableCount > 0 && <span className="grid min-w-6 place-items-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-4 text-white shadow-sm" aria-label={`${codeSnapshot.availableCount} codes available`}>{codeSnapshot.availableCount}</span>}</span><span className={`mt-0.5 max-w-full truncate text-[9px] font-bold ${activeTab === "CODES" ? "text-white/60" : "text-gray-400"}`}>{codeStatusLabel}</span></button>
    </nav>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(380px,.55fr)]">
      {activeTab === "VOTE" ? <section data-motion-reveal className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-4"><div><div className="public-kicker">Ballot</div><h2 className="text-2xl font-black tracking-tight">Cast your votes</h2><p className="mt-1 text-xs font-semibold text-gray-500">Choose one male and one female player, enter an available code, then submit.</p></div><Vote className="h-5 w-5 text-flame"/></div>
        <form onSubmit={submitVote} className="space-y-5 p-4 md:p-5">
          {snapshot.votingDeadline && <div className="rounded-xl bg-paper px-3 py-2 text-xs font-semibold text-gray-500">Voting closes {new Date(snapshot.votingDeadline).toLocaleString()}</div>}
          <div className="grid gap-4 lg:grid-cols-2"><PlayerPicker step={1} title="Male Fan Favorite" tone="male" players={filteredMale} search={maleSearch} setSearch={setMaleSearch} selectedPlayerId={selectedMaleId} setSelectedPlayerId={setSelectedMaleId}/><PlayerPicker step={2} title="Female Fan Favorite" tone="female" players={filteredFemale} search={femaleSearch} setSearch={setFemaleSearch} selectedPlayerId={selectedFemaleId} setSelectedPlayerId={setSelectedFemaleId}/></div><div className="grid gap-2 sm:grid-cols-2"><SelectionSummary label="Male pick" player={selectedMale}/><SelectionSummary label="Female pick" player={selectedFemale}/></div>
          <div className="rounded-xl border border-dashed border-court/30 bg-court/5 p-4"><label className="block"><span className="filter-label">Step 3 · Your voting code</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="filter-control mt-1 min-w-0 bg-white font-mono font-black tracking-[.16em]" placeholder="ABCDE-23456" autoComplete="off"/></label><p className="mt-2 text-xs font-semibold leading-5 text-gray-500">A {FAN_FAVORITE_VOTE_COOLDOWN_SECONDS}-second cooldown starts only after a successful vote. Invalid or already-used codes do not start the cooldown.</p></div>
          {message && <div className="vote-confirmation rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div>}
          {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div>}
          <button type="submit" disabled={!snapshot.votingOpen || !selectedMaleId || !selectedFemaleId || !code || submitting || cooldownRemaining > 0} className="btn-primary min-h-12 w-full rounded-xl text-base disabled:cursor-not-allowed disabled:opacity-50"><Heart className="h-4 w-4" fill="currentColor"/>{submitting ? "Submitting..." : cooldownRemaining > 0 ? `Vote again in ${cooldownRemaining}s` : "Submit votes"}</button>
        </form>
      </section> : <PublicCodeDrops snapshot={codeSnapshot} nextDropMs={nextCodeDropMs} onUseCode={(value) => { setCode(value); setActiveTab("VOTE"); }}/>}

      <section data-motion-reveal className="space-y-4">
        <div className="flex items-end justify-between gap-3 px-1"><div><div className="public-kicker">Standings</div><h2 className="text-2xl font-black tracking-tight">Fan Favorite Leaders</h2></div><div className="text-right text-xs font-semibold text-gray-400">Updated<br/>{new Date(snapshot.updatedAt).toLocaleTimeString()}</div></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1"><Leaderboard title="Male" totalVotes={snapshot.totalsBySex.male} rankings={snapshot.rankingsBySex.male} tone="male"/><Leaderboard title="Female" totalVotes={snapshot.totalsBySex.female} rankings={snapshot.rankingsBySex.female} tone="female"/></div>
      </section>
    </div>

    <TeamSupportBreakdown rows={snapshot.teamSupport} totalVotes={snapshot.totalVotes}/>
  </div>;
}

function TeamSupportBreakdown({ rows, totalVotes }: { rows: FanFavoriteTeamSupport[]; totalVotes: number }) {
  const leader = rows[0];
  return <section data-motion-reveal className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
      <div><div className="public-kicker">Crowd support</div><h2 className="text-2xl font-black tracking-tight">Support by Team / District</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">Based on the team of the player receiving each vote — not the voter&apos;s location or identity.</p></div>
      {leader && <div className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-black text-ink">Most supported · {leader.team.shortName}</div>}
    </div>
    {rows.length ? <div className="grid gap-px bg-line md:grid-cols-2">{rows.map((row, index) => <article key={row.team.id} className="bg-white p-4">
      <div className="flex items-center gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${index === 0 ? "bg-gold text-ink" : "bg-gray-100 text-gray-500"}`}>{index + 1}</span>
        <div className="min-w-0 flex-1"><Link href={`/teams/${row.team.id}`} className="block truncate font-black text-ink hover:text-court">{row.team.name}</Link><div className="mt-0.5 text-[11px] font-semibold text-gray-400">{row.maleVotes} male · {row.femaleVotes} female votes</div></div>
        <div className="text-right"><div className="text-xl font-black text-court">{row.votes}</div><div className="text-[10px] font-black text-gray-400">{row.percentage}%</div></div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-court" style={{ width: `${row.percentage > 0 ? Math.max(3, row.percentage) : 0}%` }}/></div>
    </article>)}</div> : <div className="p-8 text-center text-sm text-gray-500"><Users className="mx-auto mb-2 h-7 w-7 text-gray-300"/>Team support appears after the first valid votes.</div>}
    <div className="border-t border-line bg-paper px-5 py-3 text-xs font-semibold text-gray-500">{totalVotes} total player-votes counted across all teams.</div>
  </section>;
}

function PublicCodeDrops({ snapshot, nextDropMs, onUseCode }: { snapshot: PublicVotingCodeSnapshot; nextDropMs: number | null; onUseCode: (code: string) => void }) {
  const [copied, setCopied] = useState("");

  async function copyCode(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(value); window.setTimeout(() => setCopied((current) => current === value ? "" : current), 1600); }
    catch { onUseCode(value); }
  }

  const latest = snapshot.latestBatch;

  return <section data-motion-reveal className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
    <div className="border-b border-line bg-ink px-5 py-4 text-white"><div className="text-[10px] font-black uppercase tracking-[.18em] text-gold">Live code drop</div><div className="mt-1 flex flex-wrap items-end justify-between gap-3"><h2 className="text-2xl font-black tracking-tight">Grab a voting code</h2>{latest && <div className="text-right"><strong className="text-2xl font-black text-gold">{snapshot.availableCount}</strong><div className="text-[9px] font-black uppercase tracking-widest text-white/55">codes available</div></div>}</div></div>

    {!latest ? <div className="p-6 text-center"><Ticket className="mx-auto h-8 w-8 text-gray-300"/><div className="mt-3 font-black">No code drop has started yet.</div>{snapshot.nextBatch && <div className="mt-2 text-sm text-gray-500">Next {snapshot.nextBatch.quantity}-code drop in <strong className="text-ink">{countdown(nextDropMs)}</strong>.</div>}</div>
      : snapshot.availableCodes.length ? <div className="p-4 md:p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500"><span>Codes disappear automatically after they are consumed.</span>{snapshot.nextBatch && <span>Next drop in <strong className="text-ink">{countdown(nextDropMs)}</strong></span>}</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 2xl:grid-cols-4">{snapshot.availableCodes.map((value) => <div key={value} className="group flex min-w-0 items-center gap-1 rounded-lg border border-line bg-paper p-1.5"><button type="button" onClick={() => onUseCode(value)} className="min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left font-mono text-xs font-black tracking-wide hover:bg-white" title="Use this code">{value}</button><button type="button" onClick={() => void copyCode(value)} aria-label={`Copy ${value}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-court shadow-sm hover:bg-court hover:text-white">{copied === value ? <Check className="h-4 w-4"/> : <Copy className="h-4 w-4"/>}</button></div>)}</div>{latest.remainingCount !== snapshot.availableCount && <div className="mt-3 text-[11px] font-semibold text-gray-400">Latest drop: {latest.remainingCount} of {latest.quantity} remaining. Older released codes stay available until used.</div>}</div>
      : <div className="p-6 text-center"><div className="text-2xl font-black">All released codes are used.</div><div className="mt-2 text-sm text-gray-500">The latest {latest.quantity}-code drop is sold out.{snapshot.nextBatch ? <> Next drop in <strong className="text-ink">{countdown(nextDropMs)}</strong>.</> : ""}</div></div>}
  </section>;
}

function CrowdLeaderPoster({ ranking, label, tone }: { ranking?: Ranking; label: string; tone: "male" | "female" }) {
  if (!ranking?.player) return <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-4"><div className="text-[9px] font-black uppercase tracking-[.18em] text-white/55">{label}</div><div className="mt-2 text-lg font-black">No votes yet</div></div>;
  const player = ranking.player;
  return <article className="group relative overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15"><div className={`absolute inset-y-0 ${tone === "male" ? "left-0 bg-court/25" : "right-0 bg-gold/20"} w-1/2 blur-3xl`}/><div className="relative flex items-center gap-4"><Link href={`/players/${player.id}`} className="relative shrink-0"><PlayerAvatar {...player} team={player.team} size="lg"/><span className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-gold text-ink shadow"><Crown className="h-3.5 w-3.5" fill="currentColor"/></span></Link><div className="min-w-0 flex-1"><div className="text-[9px] font-black uppercase tracking-[.18em] text-gold">{label}</div><div className="mt-1 flex min-w-0 items-center gap-1.5"><Link href={`/players/${player.id}`} className="break-words text-xl font-black leading-tight tracking-tight hover:text-gold">{formatPlayerDisplayName(player)}</Link><GenderIndicator sex={player.sex} className="text-xl"/></div>{player.team ? <div className="mt-2 text-white"><TeamIdentity team={player.team} variant="micro"/></div> : <div className="mt-1 text-xs font-bold text-white/60">Player pool</div>}<div className="mt-3 flex items-end gap-2"><strong className="text-2xl font-black">{ranking.votes}</strong><span className="pb-1 text-[9px] font-black uppercase tracking-widest text-white/45">votes · {ranking.percentage}%</span></div></div></div></article>;
}

function PlayerPicker({ step, title, tone, players, search, setSearch, selectedPlayerId, setSelectedPlayerId }: { step: number; title: string; tone: "male" | "female"; players: Player[]; search: string; setSearch: (value: string) => void; selectedPlayerId: string; setSelectedPlayerId: (value: string) => void; }) {
  const accent = tone === "male" ? "border-court/20 bg-court/5" : "border-pink-200 bg-pink-50/40";
  return <div className={`overflow-hidden rounded-xl border ${accent}`}>
    <div className="border-b border-white/80 p-3.5"><div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-black"><span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[10px] text-white">{step}</span><span>{title}</span><GenderIndicator sex={tone === "male" ? "MALE" : "FEMALE"} className="text-lg"/></h3></div><input value={search} onChange={(event) => setSearch(event.target.value)} className="filter-control mt-3 bg-white" placeholder="Search player or team"/></div>
    <div className="max-h-[420px] space-y-2 overflow-y-auto p-2.5">{players.map((player) => {
      const selected = selectedPlayerId === player.id;
      return <label key={player.id} style={!selected ? teamCardStyle(player.team) : undefined} className={`grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 rounded-xl border p-3 transition ${selected ? "border-flame bg-gold/10 ring-2 ring-gold/40" : "hover:shadow-sm"}`}><input type="radio" name={tone} value={player.id} checked={selected} onChange={() => setSelectedPlayerId(player.id)} className="h-4 w-4 accent-current"/><PlayerAvatar {...player} team={player.team} size="md"/><span className="min-w-0"><span className="flex min-w-0 items-start gap-1"><strong className="break-words text-sm leading-tight sm:text-base">{formatPlayerDisplayName(player)}</strong><GenderIndicator sex={player.sex} className="mt-0.5 shrink-0 text-base"/></span>{player.team ? <span className="mt-2 block"><TeamIdentity team={player.team} variant="micro"/></span> : <span className="mt-1 block text-xs font-semibold text-gray-500">Unassigned</span>}</span></label>;
    })}{!players.length && <div className="p-6 text-center text-sm text-gray-500">No eligible players found.</div>}</div>
  </div>;
}

function SelectionSummary({ label, player }: { label: string; player?: Player }) {
  return <div className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-xs ${player ? "border-emerald-200 bg-emerald-50" : "border-dashed border-line bg-paper"}`}><span className="shrink-0 font-black uppercase tracking-wide text-gray-400">{label}</span><span className={`min-w-0 break-words font-black ${player ? "text-ink" : "text-gray-400"}`}>{player ? formatPlayerDisplayName(player) : "Choose a player"}</span></div>;
}

function Leaderboard({ title, totalVotes, rankings, tone }: { title: string; totalVotes: number; rankings: Ranking[]; tone: "male" | "female" }) {
  const accent = tone === "male" ? "from-court to-ink" : "from-flame to-gold";
  return <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className={`bg-gradient-to-br ${accent} p-4 text-white`}><div className="flex items-end justify-between gap-3"><div><div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/70"><Trophy className="h-3.5 w-3.5"/> Top 5</div><h3 className="mt-1 flex items-center gap-1.5 text-xl font-black tracking-tight">{title} Fan Favorite <GenderIndicator sex={tone === "male" ? "MALE" : "FEMALE"} className="text-xl"/></h3></div><div className="text-right"><div className="text-2xl font-black">{totalVotes}</div><div className="text-[10px] font-black uppercase tracking-widest text-white/70">votes</div></div></div></div><div className="divide-y divide-line">{rankings.length ? rankings.slice(0, 5).map((ranking) => ranking.player && <article key={ranking.player.id} className={`group p-3.5 transition hover:bg-paper ${ranking.rank === 1 ? "bg-gold/5" : ""}`}><div className="grid grid-cols-[36px_auto_minmax(0,1fr)_auto] items-center gap-3"><div className={`grid h-9 w-9 place-items-center rounded-full font-black ${ranking.rank === 1 ? "bg-gold text-ink shadow-sm" : "bg-gray-100 text-gray-600"}`}>{ranking.rank === 1 ? <Crown className="h-4 w-4" fill="currentColor"/> : ranking.rank}</div><Link href={`/players/${ranking.player.id}`}><PlayerAvatar {...ranking.player} size={ranking.rank === 1 ? "lg" : "md"}/></Link><div className="min-w-0"><div className="flex min-w-0 items-center gap-1"><Link href={`/players/${ranking.player.id}`} className="break-words font-black leading-tight hover:text-court">{formatPlayerDisplayName(ranking.player)}</Link><GenderIndicator sex={ranking.player.sex} className="text-base"/></div><div className="text-xs font-semibold text-gray-500">{ranking.player.team ? <Link href={`/teams/${ranking.player.team.id}`} className="hover:text-court hover:underline">{ranking.player.team.shortName}</Link> : "Unassigned"}</div></div><div className="text-right"><div className="text-lg font-black">{ranking.votes}</div><div className="text-[10px] font-bold text-gray-400">{ranking.percentage}%</div></div></div><div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full bg-gradient-to-r ${accent} transition-[width] duration-500 ease-out`} style={{ width: `${Math.max(4, ranking.percentage)}%` }}/></div></article>) : <div className="p-8 text-center text-sm font-semibold text-gray-500">No valid votes yet.</div>}</div></div>;
}

function countdown(milliseconds: number | null) {
  if (milliseconds === null) return "—";
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
