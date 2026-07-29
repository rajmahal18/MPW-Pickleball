import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import QrCode from "@/components/QrCode";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";
export default async function VotingAdmin({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; print?: string }> }) {
  const user = await getCurrentUser(); if (!user || user.role !== "ADMIN") redirect("/login");
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tournament) return <main className="p-8">No tournament.</main>;
  const [codes, totalVotes, attempts] = await Promise.all([
    prisma.votingCode.findMany({ where: { tournamentId: tournament.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.fanVote.count({ where: { tournamentId: tournament.id } }),
    prisma.voteAttempt.count({ where: { tournamentId: tournament.id, success: false } }),
  ]);
  let printable: string[] = [];
  if (query.print) {
    try { printable = (JSON.parse(Buffer.from(query.print, "base64url").toString("utf8")) as { codes?: string[] }).codes || []; } catch { printable = []; }
  }
  const count = (status: string) => codes.filter((code) => code.status === status).length;
  return <main className="mx-auto max-w-7xl px-4 py-8"><AdminNav/><FlashMessage success={query.success} error={query.error}/><div className="label">One-time attendance codes</div><h1 className="text-4xl font-black uppercase">Fan Favorite Voting</h1><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Valid votes" value={totalVotes}/><Stat label="Unused" value={count("UNUSED")}/><Stat label="Issued" value={count("ISSUED")}/><Stat label="Used" value={count("USED")}/><Stat label="Rejected attempts" value={attempts}/></div>
  <div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="panel p-5"><h2 className="text-xl font-black uppercase">Voting status</h2><p className="mt-1 text-sm text-gray-500">Rankings remain public while voting is open.</p><div className="mt-4 flex flex-wrap gap-3">{tournament.votingOpen ? <form action="/api/admin/settings" method="post"><input type="hidden" name="action" value="close-voting"/><button className="btn border-red-600 bg-red-600 text-white">Close voting</button></form> : <form action="/api/admin/settings" method="post" className="flex flex-wrap gap-2"><input type="hidden" name="action" value="open-voting"/><input type="datetime-local" name="votingDeadline" className="border border-line p-2"/><button className="btn-primary">Open voting</button></form>}</div></section><section className="panel p-5"><h2 className="text-xl font-black uppercase">Generate printable codes</h2><form action="/api/admin/voting-codes" method="post" className="mt-4 flex flex-wrap items-end gap-3"><input type="hidden" name="action" value="generate"/><label><span className="label block">Quantity</span><input type="number" name="count" min="1" max="100" defaultValue="20" className="mt-1 w-28 border border-line p-3"/></label><label className="flex items-center gap-2 pb-3 text-sm font-bold"><input type="checkbox" name="issued"/> Mark issued</label><button className="btn-primary">Generate</button></form><p className="mt-3 text-xs text-gray-500">Plain codes are shown only once on the print sheet. The database stores secure hashes and short hints.</p></section></div>
  {printable.length > 0 && <section className="print-sheet mt-6"><div className="no-print mb-3 flex items-center justify-between"><h2 className="text-xl font-black uppercase">New codes — print now</h2><PrintButton/></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{printable.map((code, index) => <article key={`${code}-${index}`} className="break-inside-avoid border-2 border-ink bg-white p-4 text-center"><div className="label">RVerse Fan Favorite Vote</div><div className="mx-auto my-3 w-fit"><QrCode value={code.replaceAll("-", "")} size={150}/></div><div className="font-mono text-2xl font-black tracking-widest">{code}</div><p className="mt-2 text-xs">Scan the QR or enter this backup code at the Fan Favorite page. One valid vote only.</p></article>)}</div></section>}
  <section className="panel mt-6 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-ink text-left text-white"><tr><th className="p-3">Hint</th><th className="p-3">Status</th><th className="p-3">Created</th><th className="p-3">Issued / used</th><th className="p-3">Actions</th></tr></thead><tbody>{codes.map((code) => <tr key={code.id} className="border-b border-line"><td className="p-3 font-mono font-black">{code.codeHint}</td><td className="p-3">{code.status}</td><td className="p-3">{code.createdAt.toLocaleString()}</td><td className="p-3 text-xs">{code.issuedAt?.toLocaleString() || "—"}<br/>{code.usedAt?.toLocaleString() || "—"}</td><td className="p-3"><div className="flex flex-wrap gap-2">{code.status === "UNUSED" && <Action codeId={code.id} action="issue" label="Issue"/>}{["UNUSED","ISSUED"].includes(code.status) && <><Action codeId={code.id} action="revoke" label="Revoke"/><Action codeId={code.id} action="replace" label="Replace"/></>}</div></td></tr>)}</tbody></table></section></main>;
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="panel p-4"><div className="text-2xl font-black">{value}</div><div className="label">{label}</div></div>; }
function Action({ codeId, action, label }: { codeId: string; action: string; label: string }) { return <form action="/api/admin/voting-codes" method="post"><input type="hidden" name="codeId" value={codeId}/><input type="hidden" name="action" value={action}/><button className="btn-ghost px-2 py-1 text-xs">{label}</button></form>; }
