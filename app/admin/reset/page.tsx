import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";

const scopes = [
  { scope: "SCORES", title: "Reset scores only", phrase: "RESET SCORES", details: "Preserves teams, players, pairs, users, lineups, and voting data." },
  { scope: "PROGRESS", title: "Reset tournament progress", phrase: "RESET PROGRESS", details: "Clears scores, statuses, standings, wildcard, and knockout progression." },
  { scope: "EVENT", title: "Reset event activity", phrase: "RESET EVENT", details: "Clears lineups, results, voting activity, and bracket while preserving master data and users." },
  { scope: "EXCEPT_USERS", title: "Reset everything except users", phrase: "RESET EXCEPT USERS", details: "Recreates the sample event schedule while safely retaining linked accounts and master team records." },
  { scope: "VOTING", title: "Fan Favorite reset only", phrase: "RESET VOTING", details: "Clears votes and attempts, then returns used/issued codes to unused while preserving revoked/replaced codes." },
  { scope: "FACTORY", title: "Full factory reset", phrase: "FACTORY RESET", details: "Deletes accounts and all tournament data, then recreates local sample credentials. In-database checkpoints cannot survive this reset. Requires ALLOW_FACTORY_RESET=true." },
] as const;

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser(); if (!user || user.role !== "ADMIN") redirect("/login");
  const query = await searchParams;
  return <main className="mx-auto max-w-6xl px-4 py-8"><AdminNav/><FlashMessage {...query}/><div className="label">Destructive administrative tools</div><h1 className="text-4xl font-black uppercase">Reset Data Center</h1><div className="mt-5 border-2 border-red-400 bg-red-50 p-4 text-red-950"><strong>Every scoped reset creates an automatic checkpoint first.</strong> Full factory reset is the exception because it deletes the checkpoint-owning tournament and accounts. Dependent standings, wildcard selection, bracket assignments, and MVP rankings are recalculated transactionally.</div><div className="mt-6 grid gap-5 lg:grid-cols-2">{scopes.map((item) => <section key={item.scope} className={`panel p-5 ${item.scope === "FACTORY" ? "border-red-500" : ""}`}><h2 className="text-xl font-black uppercase">{item.title}</h2><p className="mt-2 min-h-10 text-sm text-gray-600">{item.details}</p><form action="/api/admin/reset" method="post" className="mt-4 space-y-3"><input type="hidden" name="scope" value={item.scope}/><label className="block"><span className="label">Confirmation phrase</span><input name="confirmation" required placeholder={item.phrase} className="mt-1 w-full border border-line p-3 font-mono"/></label><button className={`w-full ${item.scope === "FACTORY" ? "btn border-red-700 bg-red-700 text-white" : "btn-ghost"}`}>{item.title}</button></form></section>)}</div></main>;
}
