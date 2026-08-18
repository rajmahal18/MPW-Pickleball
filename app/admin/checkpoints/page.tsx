import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function CheckpointsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SUPERADMIN") redirect("/login");
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  const [checkpoints, matchups] = tournament ? await Promise.all([
    prisma.checkpoint.findMany({ where: { tournamentId: tournament.id }, select: { id: true, name: true, kind: true, createdAt: true, createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.matchup.findMany({ where: { tournamentId: tournament.id }, select: { id: true, divisionId: true, stage: true, roundNumber: true, groupLabel: true, roundLabel: true, division: { select: { name: true } }, homeTeam: { select: { shortName: true } }, awayTeam: { select: { shortName: true } } }, orderBy: [{ division: { sortOrder: "asc" } }, { order: "asc" }] }),
  ]) : [[], []];

  const rounds = Array.from(
    new Map<string, { key: string; label: string }>(
      matchups
        .filter((matchup) => matchup.roundNumber)
        .map((matchup) => {
          const key = `${matchup.divisionId}|${matchup.stage}|${matchup.roundNumber}`;
          return [key, { key, label: `${matchup.division.name} · ${matchup.stage.replaceAll("_", " ")} · Round ${matchup.roundNumber}` }];
        }),
    ).values(),
  );

  const stages = Array.from(
    new Map<string, { key: string; label: string }>(
      matchups.map((matchup) => {
        const key = `${matchup.divisionId}|${matchup.stage}`;
        return [key, { key, label: `${matchup.division.name} · ${matchup.stage.replaceAll("_", " ")}` }];
      }),
    ).values(),
  );

  return (
    <main className="admin-shell">
      <AdminNav role={user.role}/>
      <FlashMessage {...query} />
      <div className="label">Recovery and controlled rollback</div>
      <h1 className="text-3xl font-black uppercase md:text-4xl">Checkpoints & Undo</h1>

      <div className="mt-6 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <section className="panel p-5">
          <h2 className="text-xl font-black uppercase">Create checkpoint</h2>
          <p className="mt-1 text-sm text-gray-500">Capture scores, matchups, lineups, bracket state, voting codes, and votes.</p>
          <form action="/api/admin/checkpoints" method="post" className="mt-4 space-y-3">
            <input type="hidden" name="action" value="create" />
            <input name="name" required maxLength={80} placeholder="Before format change" className="w-full border border-line p-3" />
            <SubmitButton className="btn-primary w-full" pendingLabel="Creating…">Create checkpoint</SubmitButton>
          </form>
        </section>
        <section className="border border-amber-300 bg-amber-50 p-5">
          <h2 className="font-black uppercase text-amber-950">Recovery boundary</h2>
          <p className="mt-2 text-sm text-amber-900">Activity checkpoints restore matchup/scoring/voting state. They intentionally do not roll back division definitions, player-pool eligibility, team master data, or other organizer structure edits. Granular undo is division-aware.</p>
        </section>
      </div>

      <section className="panel mt-6 p-5">
        <h2 className="text-xl font-black uppercase">Granular tournament rollback</h2>
        <p className="mt-1 text-sm text-gray-500">Reset scores in exactly one matchup, one division round, or one division stage while preserving master records. Type UNDO to confirm.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <UndoForm action="matchup" label="Undo matchup">
            <select name="matchupId" required className="w-full border border-line p-3">
              <option value="">Select matchup</option>
              {matchups.filter((matchup) => matchup.homeTeam && matchup.awayTeam).map((matchup) => (
                <option value={matchup.id} key={matchup.id}>{matchup.division.name} · {matchup.groupLabel || matchup.stage} · {matchup.roundLabel} · {matchup.homeTeam?.shortName} vs {matchup.awayTeam?.shortName}</option>
              ))}
            </select>
          </UndoForm>
          <UndoForm action="round" label="Undo division round">
            <select name="roundKey" required className="w-full border border-line p-3">
              <option value="">Select round</option>
              {rounds.map((round) => <option key={round.key} value={round.key}>{round.label}</option>)}
            </select>
          </UndoForm>
          <UndoForm action="stage" label="Undo division stage">
            <select name="stage" required className="w-full border border-line p-3">
              <option value="">Select stage</option>
              {stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
            </select>
          </UndoForm>
        </div>
      </section>

      <section className="panel mt-6 overflow-hidden">
        <div className="divide-y divide-line md:hidden">
          {checkpoints.length ? checkpoints.map((checkpoint) => <article key={checkpoint.id} className="p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-black">{checkpoint.name}</div><div className="mt-1 text-xs text-gray-500">{checkpoint.createdAt.toLocaleString()} · {checkpoint.createdBy?.name || "System"}</div></div><span className="border border-line bg-paper px-2 py-1 text-[10px] font-black uppercase">{checkpoint.kind}</span></div>
            <form action="/api/admin/checkpoints" method="post" className="mt-3 grid grid-cols-[1fr_auto] gap-2"><input type="hidden" name="action" value="restore" /><input type="hidden" name="checkpointId" value={checkpoint.id} /><input name="confirmation" required placeholder="Type RESTORE" className="min-w-0 border border-line p-2 text-sm" /><SubmitButton className="btn border-red-600 bg-red-600 px-3 py-2 text-white" pendingLabel="Restoring…">Restore</SubmitButton></form>
          </article>) : <div className="p-8 text-center text-sm text-gray-500">No checkpoints yet.</div>}
        </div>
        <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-ink text-left text-white"><tr><th className="p-3">Checkpoint</th><th className="p-3">Type</th><th className="p-3">Created by</th><th className="p-3">Created</th><th className="p-3">Restore</th></tr></thead>
          <tbody>{checkpoints.map((checkpoint) => (
            <tr key={checkpoint.id} className="border-b border-line">
              <td className="p-3 font-bold">{checkpoint.name}<div className="text-xs font-normal text-gray-500">{checkpoint.id}</div></td>
              <td className="p-3">{checkpoint.kind}</td>
              <td className="p-3">{checkpoint.createdBy?.name || "System"}</td>
              <td className="p-3">{checkpoint.createdAt.toLocaleString()}</td>
              <td className="p-3"><form action="/api/admin/checkpoints" method="post" className="flex flex-wrap gap-2"><input type="hidden" name="action" value="restore" /><input type="hidden" name="checkpointId" value={checkpoint.id} /><input name="confirmation" required placeholder="Type RESTORE" className="w-36 border border-line p-2" /><SubmitButton className="btn border-red-600 bg-red-600 px-3 py-2 text-white" pendingLabel="Restoring…">Restore</SubmitButton></form></td>
            </tr>
          ))}</tbody>
        </table>
        </div>
      </section>
    </main>
  );
}

function UndoForm({ action, label, children }: { action: string; label: string; children: ReactNode }) {
  return (
    <form action="/api/admin/undo" method="post" className="space-y-3 border border-line p-4">
      <input type="hidden" name="action" value={action} />
      <h3 className="font-black uppercase">{label}</h3>
      {children}
      <input name="confirmation" required placeholder="Type UNDO" className="w-full border border-line p-3 font-mono" />
      <SubmitButton className="btn w-full border-red-600 bg-red-600 text-white" pendingLabel="Undoing…">{label}</SubmitButton>
    </form>
  );
}
