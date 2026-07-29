"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import PlayerAvatar from "@/components/PlayerAvatar";
import { PUBLIC_POLL_INTERVAL_MS } from "@/lib/tournament/config";

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  team: { name: string; shortName: string };
};

type Ranking = { rank: number; votes: number; percentage: number; player?: Player };
type Snapshot = { votingOpen: boolean; votingDeadline: string | null; totalVotes: number; rankings: Ranking[]; updatedAt: string };

export default function FanFavoriteExperience({ players, initialCode = "" }: { players: Player[]; initialCode?: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ votingOpen: false, votingDeadline: null, totalVotes: 0, rankings: [], updatedAt: new Date().toISOString() });
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id || "");
  const [code, setCode] = useState(initialCode);
  const [search, setSearch] = useState("");
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
    const timer = window.setInterval(() => void refresh(), PUBLIC_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return players;
    return players.filter((player) => `${player.displayName || `${player.firstName} ${player.lastName}`} ${player.team.name}`.toLowerCase().includes(query));
  }, [players, search]);

  async function submitVote(event: FormEvent) {
    event.preventDefault();
    setMessage(""); setError(""); setSubmitting(true);
    try {
      const response = await fetch("/api/public/fan-favorite/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: selectedPlayerId, code }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Vote failed.");
      setMessage(payload.message || "Vote recorded.");
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

  return <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="label">One code · one vote</div><h2 className="text-2xl font-black uppercase">Cast your vote</h2></div><span className={`px-3 py-1 text-xs font-black uppercase ${snapshot.votingOpen ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}`}>{snapshot.votingOpen ? "Voting open" : "Voting closed"}</span></div>
      {snapshot.votingDeadline && <p className="mt-2 text-sm text-gray-500">Deadline: {new Date(snapshot.votingDeadline).toLocaleString()}</p>}
      <form onSubmit={submitVote} className="mt-5 space-y-5">
        <label className="block"><span className="label">Find a player</span><input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-2 w-full border border-line p-3" placeholder="Player or team" /></label>
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">{filtered.map((player) => {
          const name = player.displayName || `${player.firstName} ${player.lastName}`;
          const selected = selectedPlayerId === player.id;
          return <label key={player.id} className={`flex cursor-pointer items-center gap-3 border p-3 ${selected ? "border-court bg-emerald-50" : "border-line bg-white"}`}>
            <input type="radio" name="player" value={player.id} checked={selected} onChange={() => setSelectedPlayerId(player.id)} />
            <PlayerAvatar {...player} size="sm" />
            <span><strong className="block">{name}</strong><span className="text-xs text-gray-500">{player.team.name}</span></span>
          </label>;
        })}</div>
        <label className="block"><span className="label">Voting code</span><div className="mt-2 flex gap-2"><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="min-w-0 flex-1 border border-line p-3 font-mono font-black tracking-widest" placeholder="ABCDE-23456" autoComplete="off" /><button type="button" onClick={() => void scanCode()} className="btn-ghost">{scanning ? "Scanning…" : "Scan QR"}</button></div></label>
        {scanning && <video ref={videoRef} className="aspect-video w-full bg-black" muted playsInline />}
        {message && <div className="border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div>}
        {error && <div className="border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div>}
        <button disabled={!snapshot.votingOpen || !selectedPlayerId || !code || submitting} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Recording vote…" : "Confirm vote"}</button>
      </form>
    </section>
    <section className="panel overflow-hidden"><div className="flex items-end justify-between border-b border-line p-5"><div><div className="label">Live hype board</div><h2 className="text-2xl font-black uppercase">Fan Favorite</h2></div><div className="text-right"><div className="text-2xl font-black">{snapshot.totalVotes}</div><div className="label">valid votes</div></div></div><div className="divide-y divide-line">{snapshot.rankings.length ? snapshot.rankings.slice(0, 20).map((ranking) => ranking.player && <div key={ranking.player.id} className="grid grid-cols-[32px_1fr_auto] items-center gap-3 p-4"><div className="text-xl font-black">{ranking.rank}</div><div className="flex items-center gap-3"><PlayerAvatar {...ranking.player} size="sm" /><div><div className="font-black">{ranking.player.displayName || `${ranking.player.firstName} ${ranking.player.lastName}`}</div><div className="text-xs text-gray-500">{ranking.player.team.shortName}</div></div></div><div className="text-right"><div className="font-black">{ranking.votes}</div><div className="text-xs text-gray-500">{ranking.percentage}%</div></div></div>) : <div className="p-10 text-center text-gray-500">No valid votes yet.</div>}</div><div className="border-t border-line bg-gray-50 px-5 py-3 text-xs text-gray-500">Last updated {new Date(snapshot.updatedAt).toLocaleTimeString()}</div></section>
  </div>;
}
