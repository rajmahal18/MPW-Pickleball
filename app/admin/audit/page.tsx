import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");

  const query = await searchParams;
  const pageSize = 50;
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  const [logs, totalLogs] = tournament ? await Promise.all([
    prisma.auditLog.findMany({
      where: { tournamentId: tournament.id },
      select: { id: true, createdAt: true, action: true, entityType: true, entityId: true, simulation: true, reason: true, actor: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where: { tournamentId: tournament.id } }),
  ]) : [[], 0];
  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));
  const pageHref = (target: number) => target <= 1 ? "/admin/audit" : `/admin/audit?page=${target}`;
  if (totalLogs > 0 && page > totalPages) redirect(pageHref(totalPages));

  return <main className="admin-shell">
    <AdminNav />
    <div className="label">Immutable operational history</div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-4xl font-black uppercase">Audit Logs</h1>
      <span className="border border-line bg-white px-3 py-2 text-xs font-black">{totalLogs} records</span>
    </div>
    <section className="panel mt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-ink text-left text-white"><tr><th className="p-3">Time</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">Mode</th><th className="p-3">Reason</th></tr></thead>
        <tbody>{logs.map((log) => <tr key={log.id} className="border-b border-line align-top">
          <td className="whitespace-nowrap p-3">{log.createdAt.toLocaleString()}</td>
          <td className="p-3">{log.actor?.name || "Public/System"}</td>
          <td className="p-3 font-bold">{log.action}</td>
          <td className="p-3">{log.entityType}<div className="max-w-48 truncate text-xs text-gray-500">{log.entityId || "-"}</div></td>
          <td className="p-3">{log.simulation ? "SIMULATION" : "LIVE"}</td>
          <td className="max-w-lg p-3">{log.reason || "-"}</td>
        </tr>)}</tbody>
      </table>
    </section>
    {totalPages > 1 && <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-line bg-white p-3 text-sm font-bold">
      <Link href={pageHref(Math.max(1, page - 1))} className={`btn-ghost px-3 py-2 ${page === 1 ? "pointer-events-none opacity-45" : ""}`}>Previous</Link>
      <span>Page {page} of {totalPages}</span>
      <Link href={pageHref(Math.min(totalPages, page + 1))} className={`btn-ghost px-3 py-2 ${page >= totalPages ? "pointer-events-none opacity-45" : ""}`}>Next</Link>
    </nav>}
  </main>;
}
