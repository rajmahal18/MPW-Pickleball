import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";

export const dynamic = "force-dynamic";
export default async function CheckpointsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser(); if (!user || user.role !== "ADMIN") redirect("/login");
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  const [checkpoints, matchups] = tournament ? await Promise.all([
    prisma.checkpoint.findMany({ where: { tournamentId: tournament.id }, include: { createdBy: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.matchup.findMany({ where: { tournamentId: tournament.id }, include: { homeTeam: true, awayTeam: true }, orderBy: { order: "asc" } }),
  ]) : [[], []];
  const rounds = Array.from(
    new Map<string, { key: string; label: string }>(
      matchups
        .filter((matchup) => matchup.roundNumber)
        .map((matchup) => [
          `${matchup.stage}:${matchup.roundNumber}`,
          { key: `${matchup.stage}:${matchup.roundNumber}`, label: `${matchup.stage} · Round ${matchup.roundNumber}` },
        ]),
    ).values(),
  );
  return <main className="mx-auto max-w-6xl px-4 py-8"><AdminNav/><FlashMessage {...query}/><div className="label">Recovery and controlled rollback</div><h1 className="text-4xl font-black uppercase">Checkpoints & Undo</h1>
  <div className="mt-6 grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><section className="panel p-5"><h2 className="text-xl font-black uppercase">Create checkpoint</h2><p className="mt-1 text-sm text-gray-500">Capture scores, team matchups, lineups, bracket state, voting codes, and votes.</p><form action="/api/admin/checkpoints" method="post" className="mt-4 space-y-3"><input type="hidden" name="action" value="create"/><input name="name" required maxLength={80} placeholder="Before Semifinals" className="w-full border border-line p-3"/><button className="btn-primary w-full">Create checkpoint</button></form></section><section className="border border-amber-300 bg-amber-50 p-5"><h2 className="font-black uppercase text-amber-950">Dependency warning</h2><p className="mt-2 text-sm text-amber-900">Restoring or undoing affects group standings, wildcard selection, bracket assignments, Fan Favorite totals, and MVP rankings. The system creates an automatic safety backup first.</p></section></div>
  <section className="panel mt-6 p-5"><h2 className="text-xl font-black uppercase">Granular tournament rollback</h2><p className="mt-1 text-sm text-gray-500">These actions reset scores in the selected scope while preserving lineups and master records. Type UNDO to confirm.</p><div className="mt-4 grid gap-4 lg:grid-cols-3"><UndoForm action="matchup" label="Undo team matchup"><select name="matchupId" required className="w-full border border-line p-3"><option value="">Select team matchup</option>{matchups.filter((matchup) => matchup.homeTeam && matchup.awayTeam).map((matchup) => <option value={matchup.id} key={matchup.id}>{matchup.groupLabel || matchup.stage} · {matchup.roundLabel} · {matchup.homeTeam?.shortName} vs {matchup.awayTeam?.shortName}</option>)}</select></UndoForm><UndoForm action="round" label="Undo round"><select name="roundKey" required className="w-full border border-line p-3"><option value="">Select round</option>{rounds.map((round) => <option key={round.key} value={round.key}>{round.label}</option>)}</select></UndoForm><UndoForm action="stage" label="Undo stage"><select name="stage" required className="w-full border border-line p-3"><option value="">Select stage</option><option value="GROUP">Group Stage</option><option value="SEMIFINAL">Semifinals</option><option value="FINAL">Final</option></select></UndoForm></div></section>
  <section className="panel mt-6 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-ink text-left text-white"><tr><th className="p-3">Checkpoint</th><th className="p-3">Type</th><th className="p-3">Created by</th><th className="p-3">Created</th><th className="p-3">Restore</th></tr></thead><tbody>{checkpoints.map((checkpoint) => <tr key={checkpoint.id} className="border-b border-line"><td className="p-3 font-bold">{checkpoint.name}<div className="text-xs font-normal text-gray-500">{checkpoint.id}</div></td><td className="p-3">{checkpoint.kind}</td><td className="p-3">{checkpoint.createdBy?.name || "System"}</td><td className="p-3">{checkpoint.createdAt.toLocaleString()}</td><td className="p-3"><form action="/api/admin/checkpoints" method="post" className="flex flex-wrap gap-2"><input type="hidden" name="action" value="restore"/><input type="hidden" name="checkpointId" value={checkpoint.id}/><input name="confirmation" required placeholder="Type RESTORE" className="w-36 border border-line p-2"/><button className="btn border-red-600 bg-red-600 text-white px-3 py-2">Restore</button></form></td></tr>)}</tbody></table></section></main>;
}
function UndoForm({ action, label, children }: { action: string; label: string; children: ReactNode }) { return <form action="/api/admin/undo" method="post" className="space-y-3 border border-line p-4"><input type="hidden" name="action" value={action}/><h3 className="font-black uppercase">{label}</h3>{children}<input name="confirmation" required placeholder="Type UNDO" className="w-full border border-line p-3 font-mono"/><button className="btn border-red-600 bg-red-600 text-white w-full">{label}</button></form>; }
