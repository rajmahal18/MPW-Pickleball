"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import PlayerAvatar from "@/components/PlayerAvatar";
import { PUBLIC_POLL_INTERVAL_MS } from "@/lib/tournament/config";
import { formatPlayerDisplayName } from "@/lib/player-name";

type Player = {
  id: string;
  firstName: string;
  middleInitial?: string | null;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  sex: "MALE" | "FEMALE";
  team: { name: string; shortName: string } | null;
};

type Ranking = { rank: number; votes: number; percentage: number; player?: Player };
type Snapshot = {
  votingOpen: boolean;
  votingDeadline: string | null;
  totalVotes: number;
  totalsBySex: { male: number; female: number };
  rankingsBySex: { male: Ranking[]; female: Ranking[] };
  updatedAt: string;
};

export default function FanFavoriteExperience({ players, initialCode = "" }: { players: Player[]; initialCode?: string }) {
  const malePlayers = useMemo(() => players.filter((player) => player.sex === "MALE"), [players]);
  const femalePlayers = useMemo(() => players.filter((player) => player.sex === "FEMALE"), [players]);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    votingOpen: false,
    votingDeadline: null,
    totalVotes: 0,
    totalsBySex: { male: 0, female: 0 },
    rankingsBySex: { male: [], female: [] },
    updatedAt: new Date().toISOString(),
  });
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

  async function refresh() {
    const response = await fetch("/api/public/fan-favorite/rankings", { cache: "no-store" });
    if (response.ok) setSnapshot(await response.json());
  }

  useEffect(() => {
    void refresh();
    let stopped = false;
    const guardedRefresh = () => {
      if (!stopped && document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(guardedRefresh, PUBLIC_POLL_INTERVAL_MS);
    const onFocus = () => guardedRefresh();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  function filterPlayers(list: Player[], search: string) {
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter((player) =>
      `${formatPlayerDisplayName(player)} ${player.team?.name ?? "Unassigned"} ${player.team?.shortName ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }

  const filteredMale = useMemo(() => filterPlayers(malePlayers, maleSearch), [malePlayers, maleSearch]);
  const filteredFemale = useMemo(() => filterPlayers(femalePlayers, femaleSearch), [femalePlayers, femaleSearch]);

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
      setMessage(payload.message || "Fan Favorite votes recorded.");
      setCode("");
      await refresh();
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
        if (results[0]?.rawValue) {
          setCode(results[0].rawValue);
          return;
        }
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

  return <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
    <section className="panel overflow-hidden">
      <div className="border-b border-line bg-ink p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="label text-lime">One code - two winners</div><h2 className="text-2xl font-black uppercase">Cast your votes</h2></div>
          <span className={`px-3 py-1 text-xs font-black uppercase ${snapshot.votingOpen ? "bg-lime text-ink" : "bg-white/15 text-white/70"}`}>{snapshot.votingOpen ? "Voting open" : "Voting closed"}</span>
        </div>
      </div>
      <div className="p-5">
        {snapshot.votingDeadline && <p className="text-sm text-gray-500">Deadline: {new Date(snapshot.votingDeadline).toLocaleString()}</p>}
        <form onSubmit={submitVote} className="mt-5 space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <PlayerPicker title="Male Fan Favorite" tone="male" players={filteredMale} search={maleSearch} setSearch={setMaleSearch} selectedPlayerId={selectedMaleId} setSelectedPlayerId={setSelectedMaleId} />
            <PlayerPicker title="Female Fan Favorite" tone="female" players={filteredFemale} search={femaleSearch} setSearch={setFemaleSearch} selectedPlayerId={selectedFemaleId} setSelectedPlayerId={setSelectedFemaleId} />
          </div>
          <label className="block"><span className="label">Voting code</span><div className="mt-2 flex gap-2"><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="min-w-0 flex-1 border border-line p-3 font-mono font-black tracking-widest" placeholder="ABCDE-23456" autoComplete="off" /><button type="button" onClick={() => void scanCode()} className="btn-ghost">{scanning ? "Scanning..." : "Scan QR"}</button></div></label>
          {scanning && <video ref={videoRef} className="aspect-video w-full bg-black" muted playsInline />}
          {message && <div className="border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div>}
          {error && <div className="border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div>}
          <button type="submit" disabled={!snapshot.votingOpen || !selectedMaleId || !selectedFemaleId || !code || submitting} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Recording votes..." : "Confirm votes"}</button>
        </form>
      </div>
    </section>
    <section className="space-y-4">
      <div className="panel overflow-hidden border-ink"><div className="flex items-end justify-between bg-ink p-5 text-white"><div><div className="label text-lime">Current standings</div><h2 className="text-2xl font-black uppercase">Fan Favorite Race</h2></div><div className="text-right"><div className="text-2xl font-black">{snapshot.totalVotes}</div><div className="label text-white/70">valid votes</div></div></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <Leaderboard title="Male" totalVotes={snapshot.totalsBySex.male} rankings={snapshot.rankingsBySex.male} tone="male" />
        <Leaderboard title="Female" totalVotes={snapshot.totalsBySex.female} rankings={snapshot.rankingsBySex.female} tone="female" />
      </div>
      <div className="border border-line bg-white px-5 py-3 text-xs text-gray-500">Last updated {new Date(snapshot.updatedAt).toLocaleTimeString()}</div>
    </section>
  </div>;
}

function PlayerPicker({
  title,
  tone,
  players,
  search,
  setSearch,
  selectedPlayerId,
  setSelectedPlayerId,
}: {
  title: string;
  tone: "male" | "female";
  players: Player[];
  search: string;
  setSearch: (value: string) => void;
  selectedPlayerId: string;
  setSelectedPlayerId: (value: string) => void;
}) {
  const accent = tone === "male" ? "border-court/30 bg-court/10" : "border-gold/60 bg-gold/10";
  return <div className={`border ${accent}`}>
    <div className="border-b border-white/70 p-4">
      <h3 className="font-black uppercase">{title}</h3>
      <input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-3 w-full border border-line bg-white p-3" placeholder="Search player or team" />
    </div>
    <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">{players.map((player) => {
      const name = formatPlayerDisplayName(player);
      const selected = selectedPlayerId === player.id;
      return <label key={player.id} className={`flex cursor-pointer items-center gap-3 border bg-white p-3 ${selected ? "border-ink ring-2 ring-lime" : "border-line"}`}>
        <input type="radio" name={tone} value={player.id} checked={selected} onChange={() => setSelectedPlayerId(player.id)} />
        <PlayerAvatar {...player} size="sm" />
        <span><strong className="block">{name}</strong><span className="text-xs text-gray-500">{player.team?.name ?? "Unassigned"}</span></span>
      </label>;
    })}{!players.length && <div className="p-6 text-center text-sm text-gray-500">No eligible players found.</div>}</div>
  </div>;
}

function Leaderboard({ title, totalVotes, rankings, tone }: { title: string; totalVotes: number; rankings: Ranking[]; tone: "male" | "female" }) {
  const header = tone === "male" ? "bg-court" : "bg-gold";
  const headerText = tone === "male" ? "text-white" : "text-ink";
  return <div className="panel overflow-hidden">
    <div className={`${header} ${headerText} p-4`}>
      <div className="flex items-end justify-between gap-3"><div><div className="text-xs font-black uppercase opacity-70">Top 5</div><h3 className="text-xl font-black uppercase">{title} Fan Favorite</h3></div><div className="text-right"><div className="text-2xl font-black">{totalVotes}</div><div className="text-xs font-bold uppercase opacity-70">votes</div></div></div>
    </div>
    <div className="divide-y divide-line bg-white">{rankings.length ? rankings.slice(0, 5).map((ranking) => ranking.player && <div key={ranking.player.id} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 p-4">
      <div className={`grid h-8 w-8 place-items-center font-black ${ranking.rank === 1 ? "bg-lime text-ink" : "bg-gray-100 text-gray-700"}`}>{ranking.rank}</div>
      <div className="flex min-w-0 items-center gap-3"><PlayerAvatar {...ranking.player} size="sm" /><div className="min-w-0"><div className="truncate font-black">{formatPlayerDisplayName(ranking.player)}</div><div className="text-xs text-gray-500">{ranking.player.team?.shortName ?? "Unassigned"}</div></div></div>
      <div className="text-right"><div className="font-black">{ranking.votes}</div><div className="text-xs text-gray-500">{ranking.percentage}%</div></div>
    </div>) : <div className="p-8 text-center text-gray-500">No valid votes yet.</div>}</div>
  </div>;
}
