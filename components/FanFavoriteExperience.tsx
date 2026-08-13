"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Crown, Heart, ScanLine, Trophy, Vote } from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";
import { FAN_FAVORITE_CLOSED_POLL_INTERVAL_MS, FAN_FAVORITE_POLL_INTERVAL_MS, PUBLIC_POLL_JITTER_RATIO } from "@/lib/tournament/config";
import { formatPlayerDisplayName } from "@/lib/player-name";

export type FanFavoritePlayer = {
  id: string;
  firstName: string;
  middleInitial?: string | null;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  sex: "MALE" | "FEMALE";
  team: { name: string; shortName: string } | null;
};

type Player = FanFavoritePlayer;
export type FanFavoriteRanking = { rank: number; votes: number; percentage: number; player?: Player };
type Ranking = FanFavoriteRanking;
export type FanFavoriteSnapshot = {
  votingOpen: boolean;
  votingDeadline: string | null;
  totalVotes: number;
  totalsBySex: { male: number; female: number };
  rankingsBySex: { male: Ranking[]; female: Ranking[] };
  updatedAt: string;
};

export default function FanFavoriteExperience({ players, initialCode = "", initialSnapshot }: { players: Player[]; initialCode?: string; initialSnapshot?: FanFavoriteSnapshot }) {
  const malePlayers = useMemo(() => players.filter((player) => player.sex === "MALE"), [players]);
  const femalePlayers = useMemo(() => players.filter((player) => player.sex === "FEMALE"), [players]);
  const [snapshot, setSnapshot] = useState<FanFavoriteSnapshot>(initialSnapshot ?? { votingOpen: false, votingDeadline: null, totalVotes: 0, totalsBySex: { male: 0, female: 0 }, rankingsBySex: { male: [], female: [] }, updatedAt: new Date().toISOString() });
  const [selectedMaleId, setSelectedMaleId] = useState(malePlayers[0]?.id || "");
  const [selectedFemaleId, setSelectedFemaleId] = useState(femalePlayers[0]?.id || "");
  const [code, setCode] = useState(initialCode);
  const [maleSearch, setMaleSearch] = useState("");
  const [femaleSearch, setFemaleSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);

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
      if (document.visibilityState !== "visible") {
        schedule(FAN_FAVORITE_CLOSED_POLL_INTERVAL_MS);
        return;
      }
      controller?.abort();
      controller = new AbortController();
      try {
        await refresh(controller.signal);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          // Keep the current standings visible; the next poll/focus retries.
        }
      } finally {
        controller = null;
        schedule(snapshot.votingOpen ? FAN_FAVORITE_POLL_INTERVAL_MS : FAN_FAVORITE_CLOSED_POLL_INTERVAL_MS);
      }
    };

    schedule(FAN_FAVORITE_POLL_INTERVAL_MS);
    const onFocus = () => void run();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      controller?.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [snapshot.votingOpen]);

  function filterPlayers(list: Player[], search: string) {
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter((player) => `${formatPlayerDisplayName(player)} ${player.team?.name ?? "Unassigned"} ${player.team?.shortName ?? ""}`.toLowerCase().includes(query));
  }

  const filteredMale = useMemo(() => filterPlayers(malePlayers, maleSearch), [malePlayers, maleSearch]);
  const filteredFemale = useMemo(() => filterPlayers(femalePlayers, femaleSearch), [femalePlayers, femaleSearch]);
  const maleLeader = snapshot.rankingsBySex.male[0];
  const femaleLeader = snapshot.rankingsBySex.female[0];

  async function submitVote(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/public/fan-favorite/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ malePlayerId: selectedMaleId, femalePlayerId: selectedFemaleId, code }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Vote failed.");
      setMessage(payload.message || "Your Fan Favorite picks are in!");
      setCode("");
      setSnapshot((current) => ({
        ...current,
        totalVotes: current.totalVotes + 2,
        totalsBySex: { male: current.totalsBySex.male + 1, female: current.totalsBySex.female + 1 },
        updatedAt: new Date().toISOString(),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vote failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function scanCode() {
    setError("");
    const BarcodeDetectorClass = (window as unknown as { BarcodeDetector?: new (input: { formats: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    if (!BarcodeDetectorClass || !navigator.mediaDevices?.getUserMedia) {
      setError("QR scanning is not supported by this browser. Enter the backup code instead.");
      return;
    }
    let stream: MediaStream | null = null;
    setScanning(true);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (!videoRef.current) throw new Error("Camera preview is not available.");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const detector = new BarcodeDetectorClass({ formats: ["qr_code"] });
      const started = Date.now();
      while (Date.now() - started < 20_000 && videoRef.current) {
        const results = await detector.detect(videoRef.current);
        if (results[0]?.rawValue) { setCode(results[0].rawValue); return; }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      setError("No QR code was detected. Enter the backup code instead.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Camera access failed. Enter the backup code instead.");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setScanning(false);
    }
  }

  return <div className="space-y-6">
    <section className="fan-arena overflow-hidden rounded-2xl border border-ink/10 shadow-panel">
      <div className="relative grid gap-5 p-5 text-white md:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[.18em]">Fan Favorite voting</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Fan Favorite</h2>
        </div>
        <div className="relative z-10 flex items-center gap-3 lg:justify-end">
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-center backdrop-blur"><div className="text-3xl font-black">{snapshot.totalVotes}</div><div className="text-[10px] font-black uppercase tracking-widest text-white/65">votes cast</div></div>
          <div className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider ${snapshot.votingOpen ? "bg-gold text-ink" : "bg-white/15 text-white/70"}`}>{snapshot.votingOpen ? "Voting open" : "Voting closed"}</div>
        </div>
        <div className="relative z-10 grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <CrowdLeaderPoster ranking={maleLeader} label="Male leader" tone="male"/>
          <CrowdLeaderPoster ranking={femaleLeader} label="Female leader" tone="female"/>
        </div>
        <Heart className="absolute -right-6 -top-8 h-36 w-36 rotate-12 text-white/5" fill="currentColor"/>
        <Trophy className="absolute -bottom-8 left-1/2 h-32 w-32 -rotate-12 text-gold/10"/>
      </div>
    </section>

    <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
      <section data-motion-reveal className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-4">
          <div><div className="public-kicker">Ballot</div><h2 className="text-2xl font-black tracking-tight">Cast your votes</h2></div>
          <div className="grid h-11 w-11 place-items-center rounded-full bg-gold/15 text-flame"><Vote className="h-5 w-5"/></div>
        </div>
        <form onSubmit={submitVote} className="space-y-5 p-4 md:p-5">
          {snapshot.votingDeadline && <div className="rounded-xl bg-paper px-3 py-2 text-xs font-semibold text-gray-500">Voting closes {new Date(snapshot.votingDeadline).toLocaleString()}</div>}
          <div className="grid gap-4 lg:grid-cols-2">
            <PlayerPicker title="Male Fan Favorite" tone="male" players={filteredMale} search={maleSearch} setSearch={setMaleSearch} selectedPlayerId={selectedMaleId} setSelectedPlayerId={setSelectedMaleId}/>
            <PlayerPicker title="Female Fan Favorite" tone="female" players={filteredFemale} search={femaleSearch} setSearch={setFemaleSearch} selectedPlayerId={selectedFemaleId} setSelectedPlayerId={setSelectedFemaleId}/>
          </div>
          <div className="rounded-xl border border-dashed border-court/30 bg-court/5 p-4">
            <label className="block"><span className="filter-label">Your voting code</span><div className="flex flex-col gap-2 sm:flex-row"><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="filter-control min-w-0 flex-1 bg-white font-mono font-black tracking-[.16em]" placeholder="ABCDE-23456" autoComplete="off"/><button type="button" onClick={() => void scanCode()} className="btn-ghost min-h-11 w-full rounded-lg sm:w-auto"><ScanLine className="h-4 w-4"/>{scanning ? "Scanning..." : "Scan QR"}</button></div></label>
            {scanning && <video ref={videoRef} className="mt-3 aspect-video w-full rounded-xl bg-black" muted playsInline/>}
          </div>
          {message && <div className="vote-confirmation rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div>}
          {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div>}
          <button type="submit" disabled={!snapshot.votingOpen || !selectedMaleId || !selectedFemaleId || !code || submitting} className="btn-primary min-h-12 w-full rounded-xl text-base disabled:cursor-not-allowed disabled:opacity-50"><Heart className="h-4 w-4" fill="currentColor"/>{submitting ? "Submitting..." : "Submit votes"}</button>
        </form>
      </section>

      <section data-motion-reveal className="space-y-4">
        <div className="flex items-end justify-between gap-3 px-1"><div><div className="public-kicker">Standings</div><h2 className="text-2xl font-black tracking-tight">Fan Favorite Leaders</h2></div><div className="text-right text-xs font-semibold text-gray-400">Updated<br/>{new Date(snapshot.updatedAt).toLocaleTimeString()}</div></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Leaderboard title="Male" totalVotes={snapshot.totalsBySex.male} rankings={snapshot.rankingsBySex.male} tone="male"/>
          <Leaderboard title="Female" totalVotes={snapshot.totalsBySex.female} rankings={snapshot.rankingsBySex.female} tone="female"/>
        </div>
      </section>
    </div>
  </div>;
}

function CrowdLeaderPoster({ ranking, label, tone }: { ranking?: Ranking; label: string; tone: "male" | "female" }) {
  if (!ranking?.player) return <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-4"><div className="text-[9px] font-black uppercase tracking-[.18em] text-white/55">{label}</div><div className="mt-2 text-lg font-black">No votes yet</div></div>;
  const player = ranking.player;
  return <Link href={`/players/${player.id}`} className="group relative overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15">
    <div className={`absolute inset-y-0 ${tone === "male" ? "left-0 bg-court/25" : "right-0 bg-gold/20"} w-1/2 blur-3xl`}/>
    <div className="relative flex items-center gap-4"><div className="relative"><div className="absolute inset-0 scale-110 rounded-full bg-gold/25 blur-xl"/><div className="relative"><PlayerAvatar {...player} size="lg"/></div><span className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-gold text-ink shadow"><Crown className="h-3.5 w-3.5" fill="currentColor"/></span></div><div className="min-w-0 flex-1"><div className="text-[9px] font-black uppercase tracking-[.18em] text-gold">{label}</div><div className="mt-1 truncate text-xl font-black tracking-tight group-hover:text-gold">{formatPlayerDisplayName(player)}</div><div className="mt-1 truncate text-xs font-bold text-white/60">{player.team?.shortName ?? "Player pool"}</div><div className="mt-3 flex items-end gap-2"><strong className="text-2xl font-black">{ranking.votes}</strong><span className="pb-1 text-[9px] font-black uppercase tracking-widest text-white/45">votes · {ranking.percentage}%</span></div></div></div>
  </Link>;
}

function PlayerPicker({ title, tone, players, search, setSearch, selectedPlayerId, setSelectedPlayerId }: {
  title: string;
  tone: "male" | "female";
  players: Player[];
  search: string;
  setSearch: (value: string) => void;
  selectedPlayerId: string;
  setSelectedPlayerId: (value: string) => void;
}) {
  const accent = tone === "male" ? "border-court/20 bg-court/5" : "border-gold/50 bg-gold/10";
  return <div className={`overflow-hidden rounded-xl border ${accent}`}>
    <div className="border-b border-white/80 p-3.5"><div className="flex items-center justify-between gap-2"><h3 className="font-black">{title}</h3><Heart className={`h-4 w-4 ${tone === "male" ? "text-court" : "text-flame"}`} fill="currentColor"/></div><input value={search} onChange={(event) => setSearch(event.target.value)} className="filter-control mt-3 bg-white" placeholder="Search player or team"/></div>
    <div className="max-h-[390px] space-y-2 overflow-y-auto p-2.5">{players.map((player) => {
      const selected = selectedPlayerId === player.id;
      return <label key={player.id} className={`grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 rounded-xl border bg-white p-3 transition ${selected ? "border-flame bg-gold/10 ring-2 ring-gold/40" : "border-line hover:-translate-y-0.5 hover:border-court/40 hover:shadow-sm"}`}>
        <input type="radio" name={tone} value={player.id} checked={selected} onChange={() => setSelectedPlayerId(player.id)} className="h-4 w-4 accent-current"/>
        <PlayerAvatar {...player} size="md"/>
        <span className="min-w-0"><strong className="block truncate text-sm leading-tight sm:text-base">{formatPlayerDisplayName(player)}</strong><span className="mt-1 block truncate text-xs font-semibold text-gray-500">{player.team?.shortName ?? "Unassigned"}</span></span>
      </label>;
    })}{!players.length && <div className="p-6 text-center text-sm text-gray-500">No eligible players found.</div>}</div>
  </div>;
}

function Leaderboard({ title, totalVotes, rankings, tone }: { title: string; totalVotes: number; rankings: Ranking[]; tone: "male" | "female" }) {
  const accent = tone === "male" ? "from-court to-ink" : "from-flame to-gold";
  return <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
    <div className={`bg-gradient-to-br ${accent} p-4 text-white`}><div className="flex items-end justify-between gap-3"><div><div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/70"><Trophy className="h-3.5 w-3.5"/> Top 5</div><h3 className="mt-1 text-xl font-black tracking-tight">{title} Fan Favorite</h3></div><div className="text-right"><div className="text-2xl font-black">{totalVotes}</div><div className="text-[10px] font-black uppercase tracking-widest text-white/70">votes</div></div></div></div>
    <div className="divide-y divide-line">{rankings.length ? rankings.slice(0, 5).map((ranking) => ranking.player && <Link href={`/players/${ranking.player.id}`} key={ranking.player.id} className={`group block p-3.5 transition hover:bg-paper ${ranking.rank === 1 ? "bg-gold/5" : ""}`}>
      <div className="grid grid-cols-[36px_auto_minmax(0,1fr)_auto] items-center gap-3">
        <div className={`grid h-9 w-9 place-items-center rounded-full font-black ${ranking.rank === 1 ? "bg-gold text-ink shadow-sm" : "bg-gray-100 text-gray-600"}`}>{ranking.rank === 1 ? <Crown className="h-4 w-4" fill="currentColor"/> : ranking.rank}</div>
        <PlayerAvatar {...ranking.player} size={ranking.rank === 1 ? "lg" : "md"}/>
        <div className="min-w-0"><div className="truncate font-black group-hover:text-court">{formatPlayerDisplayName(ranking.player)}</div><div className="text-xs font-semibold text-gray-500">{ranking.player.team?.shortName ?? "Unassigned"}</div></div>
        <div className="text-right"><div className="text-lg font-black">{ranking.votes}</div><div className="text-[10px] font-bold text-gray-400">{ranking.percentage}%</div></div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full bg-gradient-to-r ${accent} transition-[width] duration-500 ease-out`} style={{ width: `${Math.max(4, ranking.percentage)}%` }}/></div>
    </Link>) : <div className="p-8 text-center text-sm font-semibold text-gray-500">No valid votes yet.</div>}</div>
  </div>;
}
