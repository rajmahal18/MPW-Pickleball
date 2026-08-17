import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import QrCode from "@/components/QrCode";
import PrintButton from "@/components/PrintButton";
import SubmitButton from "@/components/SubmitButton";
import FanFavoriteAdminLive from "@/components/FanFavoriteAdminLive";
import { getVotingAdminSnapshot } from "@/lib/tournament/voting-dashboard";

export const dynamic = "force-dynamic";

export default async function VotingAdmin({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; print?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, votingOpen: true } });
  if (!tournament) return <main className="admin-shell">No tournament.</main>;

  const [manualCodes, attempts, liveSnapshot] = await Promise.all([
    prisma.votingCode.findMany({
      where: { tournamentId: tournament.id, batchId: null },
      select: { id: true, codeHint: true, status: true, issuedAt: true, usedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.voteAttempt.count({ where: { tournamentId: tournament.id, success: false } }),
    getVotingAdminSnapshot(tournament.id),
  ]);

  let printable: string[] = [];
  if (query.print) {
    try { printable = (JSON.parse(Buffer.from(query.print, "base64url").toString("utf8")) as { codes?: string[] }).codes || []; } catch { printable = []; }
  }

  return <main className="admin-shell">
    <AdminNav/>
    <FlashMessage success={query.success} error={query.error}/>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><div className="label">Fan Favorite operations</div><h1 className="text-3xl font-black uppercase md:text-4xl">Voting & Code Drops</h1><p className="mt-1 text-sm text-gray-500">Schedule public code batches, watch depletion speed, and track vote distribution without clutter.</p></div>
      <span className="border border-line bg-white px-3 py-2 text-xs font-bold text-gray-600">{attempts} rejected attempt{attempts === 1 ? "" : "s"}</span>
    </div>

    <div className="mt-5 grid gap-4 lg:grid-cols-[.75fr_1.25fr]">
      <section className="panel p-5">
        <div className="label text-court">Voting gate</div><h2 className="text-xl font-black uppercase">Voting status</h2>
        <div className="mt-4">{tournament.votingOpen
          ? <form action="/api/admin/settings" method="post"><input type="hidden" name="action" value="close-voting"/><SubmitButton className="btn border-red-600 bg-red-600 text-white" pendingLabel="Closing...">Close voting</SubmitButton></form>
          : <form action="/api/admin/settings" method="post" className="flex flex-wrap gap-2"><input type="hidden" name="action" value="open-voting"/><input type="datetime-local" name="votingDeadline" className="border border-line p-2"/><SubmitButton pendingLabel="Opening...">Open voting</SubmitButton></form>}
        </div>
      </section>

      <section className="panel p-5">
        <div className="label text-court">Next drop</div><h2 className="text-xl font-black uppercase">Schedule public codes</h2>
        <form action="/api/admin/voting-codes" method="post" className="mt-4 grid gap-3 sm:grid-cols-[140px_minmax(220px,1fr)_auto] sm:items-end">
          <input type="hidden" name="action" value="schedule-batch"/>
          <label><span className="label block"># of codes</span><input type="number" name="count" min="1" max="500" defaultValue="100" className="mt-1 w-full border border-line p-3 font-black"/></label>
          <label><span className="label block">Release time · PH</span><input type="datetime-local" name="releaseAt" required defaultValue={defaultReleaseInput()} className="mt-1 w-full border border-line p-3 font-bold"/></label>
          <SubmitButton className="btn-primary min-h-12" pendingLabel="Scheduling...">Schedule drop</SubmitButton>
        </form>
        <p className="mt-3 text-xs text-gray-500">Scheduled public codes stay hidden and unusable until the server reaches the release time.</p>
      </section>
    </div>

    <FanFavoriteAdminLive initialSnapshot={liveSnapshot}/>

    {printable.length > 0 && <section className="print-sheet mt-6"><div className="no-print mb-3 flex items-center justify-between"><h2 className="text-xl font-black uppercase">New manual codes — print now</h2><PrintButton/></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{printable.map((code, index) => <article key={`${code}-${index}`} className="break-inside-avoid border-2 border-ink bg-white p-4 text-center"><div className="label">MPW Fan Favorite Vote</div><div className="mx-auto my-3 w-fit"><QrCode value={code.replaceAll("-", "")} size={150}/></div><div className="font-mono text-2xl font-black tracking-widest">{code}</div><p className="mt-2 text-xs">Scan the QR or enter this backup code at the Fan Favorite page. Select one male player and one female player.</p></article>)}</div></section>}

    <details className="panel mt-6 overflow-hidden">
      <summary className="cursor-pointer p-4 font-black uppercase">Manual / printable codes <span className="ml-2 text-xs font-semibold normal-case text-gray-500">Legacy attendance-style codes</span></summary>
      <div className="border-t border-line p-4">
        <form action="/api/admin/voting-codes" method="post" className="flex flex-wrap items-end gap-3"><input type="hidden" name="action" value="generate"/><label><span className="label block">Quantity</span><input type="number" name="count" min="1" max="100" defaultValue="20" className="mt-1 w-28 border border-line p-3"/></label><label className="flex items-center gap-2 pb-3 text-sm font-bold"><input type="checkbox" name="issued"/> Mark issued</label><SubmitButton pendingLabel="Generating...">Generate & print</SubmitButton></form>
        <p className="mt-3 text-xs text-gray-500">These codes remain hash-only and are shown in plaintext only once on the print sheet. Public drop codes are managed above.</p>
      </div>
      <div className="divide-y divide-line border-t border-line">{manualCodes.length ? manualCodes.map((code) => <article key={code.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"><div><div className="font-mono font-black">{code.codeHint}</div><div className="mt-1 text-xs text-gray-500">{code.status} · created {code.createdAt.toLocaleString()}</div></div><div className="flex flex-wrap gap-2">{code.status === "UNUSED" && <Action codeId={code.id} action="issue" label="Issue"/>}{["UNUSED","ISSUED"].includes(code.status) && <><Action codeId={code.id} action="revoke" label="Revoke"/><Action codeId={code.id} action="replace" label="Replace"/></>}</div></article>) : <div className="p-6 text-center text-sm text-gray-500">No manual codes.</div>}</div>
    </details>
  </main>;
}

function Action({ codeId, action, label }: { codeId: string; action: string; label: string }) {
  return <form action="/api/admin/voting-codes" method="post"><input type="hidden" name="codeId" value={codeId}/><input type="hidden" name="action" value={action}/><SubmitButton className="btn-ghost px-2 py-1 text-xs" pendingLabel="Saving...">{label}</SubmitButton></form>;
}

function defaultReleaseInput() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(next);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
