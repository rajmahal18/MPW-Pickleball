import Link from "next/link";
import { Crown, Sparkles } from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";
import { formatPlayerDisplayName } from "@/lib/player-name";
import type { MvpRow } from "@/lib/tournament/mvp";

export default function MythicalPairPoster({ male, female, compact = false }: { male?: MvpRow; female?: MvpRow; compact?: boolean }) {
  if (!male && !female) return null;
  return <section className={`mythical-pair-poster relative overflow-hidden rounded-2xl border border-white/10 text-white shadow-panel ${compact ? "p-4 md:p-5" : "p-5 md:p-8"}`}>
    <div className="mythical-pair-glow mythical-pair-glow-left"/>
    <div className="mythical-pair-glow mythical-pair-glow-right"/>
    <Crown className="absolute -right-5 -top-7 h-28 w-28 rotate-12 text-gold/10" fill="currentColor"/>
    <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
      <div><div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] text-gold"><Sparkles className="h-3.5 w-3.5"/> MVP leaders</div><h2 className={`${compact ? "mt-2 text-2xl md:text-3xl" : "mt-3 text-3xl md:text-5xl"} font-black tracking-[-.04em]`}>Mythical Pair</h2></div>
    </div>

    <div className={`relative z-10 mt-5 grid items-stretch ${compact ? "gap-3 sm:grid-cols-[1fr_auto_1fr]" : "gap-4 md:mt-7 md:grid-cols-[1fr_auto_1fr]"}`}>
      <MythicPlayer row={male} label="Male MVP leader" align="left" compact={compact}/>
      <div className="hidden items-center justify-center md:flex"><div className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/10 text-gold backdrop-blur"><Sparkles className="h-5 w-5"/></div></div>
      <MythicPlayer row={female} label="Female MVP leader" align="right" compact={compact}/>
    </div>
  </section>;
}

function MythicPlayer({ row, label, align, compact }: { row?: MvpRow; label: string; align: "left" | "right"; compact: boolean }) {
  if (!row) return <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 p-5 text-center text-sm font-bold text-white/55">Waiting for enough match data.</div>;
  return <Link href={`/players/${row.player.id}`} className={`mythical-player-card group flex min-w-0 items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15 ${align === "right" ? "md:flex-row-reverse md:text-right" : ""}`}>
    <div className="relative shrink-0"><div className="absolute inset-0 scale-110 rounded-full bg-gold/20 blur-xl"/><div className="relative"><PlayerAvatar {...row.player} size={compact ? "lg" : "xl"}/></div></div>
    <div className="min-w-0 flex-1"><div className="text-[9px] font-black uppercase tracking-[.16em] text-gold">{label}</div><div className={`${compact ? "text-lg" : "text-xl md:text-2xl"} mt-1 truncate font-black tracking-tight group-hover:text-gold`}>{formatPlayerDisplayName(row.player)}</div><div className="mt-1 truncate text-xs font-bold text-white/60">{row.player.team?.shortName || "Historical pair"} · {row.wins}-{row.losses} · {row.gamesPlayed} matches</div><div className="mt-3 flex items-end gap-2 md:justify-start"><strong className={`${compact ? "text-2xl" : "text-3xl"} font-black text-gold`}>{row.mvpIndex}</strong><span className="pb-1 text-[9px] font-black uppercase tracking-widest text-white/45">MVP index</span></div></div>
  </Link>;
}
