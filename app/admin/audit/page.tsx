import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";
export default async function AuditPage() {
  const user = await getCurrentUser(); if (!user || user.role !== "ADMIN") redirect("/login");
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  const logs = tournament ? await prisma.auditLog.findMany({ where: { tournamentId: tournament.id }, include: { actor: true }, orderBy: { createdAt: "desc" }, take: 300 }) : [];
  return <main className="mx-auto max-w-7xl px-4 py-8"><AdminNav/><div className="label">Immutable operational history</div><h1 className="text-4xl font-black uppercase">Audit Logs</h1><section className="panel mt-6 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-ink text-left text-white"><tr><th className="p-3">Time</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">Mode</th><th className="p-3">Reason / state</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-b border-line align-top"><td className="whitespace-nowrap p-3">{log.createdAt.toLocaleString()}</td><td className="p-3">{log.actor?.name || "Public/System"}</td><td className="p-3 font-bold">{log.action}</td><td className="p-3">{log.entityType}<div className="max-w-48 truncate text-xs text-gray-500">{log.entityId || "—"}</div></td><td className="p-3">{log.simulation ? "SIMULATION" : "LIVE"}</td><td className="max-w-lg p-3"><div>{log.reason || "—"}</div>{(log.beforeState || log.afterState) && <details className="mt-1"><summary className="cursor-pointer text-xs font-bold text-court">View state</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap bg-gray-50 p-2 text-[11px]">{JSON.stringify({ before: log.beforeState, after: log.afterState }, null, 2)}</pre></details>}</td></tr>)}</tbody></table></section></main>;
}
