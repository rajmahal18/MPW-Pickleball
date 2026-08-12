import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import SubmitButton from "@/components/SubmitButton";

const scopes = [
  { scope: "SCORES", title: "Reset scores only", phrase: "RESET SCORES", details: "Preserves teams, players, pairs, users, lineups, and voting data." },
  { scope: "PROGRESS", title: "Reset tournament progress", phrase: "RESET PROGRESS", details: "Clears scores and statuses across all divisions, then reopens automatically progressed knockout slots without deleting the configured structure." },
  { scope: "EVENT", title: "Reset event activity", phrase: "RESET EVENT", details: "Clears lineups, results, and voting activity while preserving the organizer's current divisions, groups, teams, and matchup structure." },
  { scope: "MASTER_DATA", title: "Reset to master data only", phrase: "RESET MASTER DATA", details: "Deletes matchups, lineups, matches, scores, voting activity, simulations, and checkpoints. Preserves player pool, teams, player team assignments, groups, divisions, and accounts." },
  { scope: "EXCEPT_USERS", title: "Reset everything except users", phrase: "RESET EXCEPT USERS", details: "Clears event activity while retaining accounts, master records, and the current organizer-defined tournament structure." },
  { scope: "VOTING", title: "Fan Favorite reset only", phrase: "RESET VOTING", details: "Clears votes and attempts, then returns used/issued codes to unused while preserving revoked/replaced codes." },
  { scope: "FACTORY", title: "Full factory reset", phrase: "FACTORY RESET", details: "Deletes accounts and all tournament data, then recreates local sample credentials. In-database checkpoints cannot survive this reset. Requires ALLOW_FACTORY_RESET=true." },
] as const;

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser(); if (!user || user.role !== "ADMIN") redirect("/login");
  const query = await searchParams;
  return <main className="admin-shell"><AdminNav/><FlashMessage {...query}/><div className="label">Destructive administrative tools</div><h1 className="text-3xl font-black uppercase md:text-4xl">Reset Data Center</h1><div className="mt-5 border-2 border-red-400 bg-red-50 p-4 text-red-950"><strong>Most scoped resets create an automatic checkpoint first.</strong> Master-data-only and full factory reset intentionally clear checkpoint history. Dependent standings, configured automatic progression, bracket assignments, Fan Favorite totals, and MVP rankings are recalculated transactionally when retained.</div><div className="mt-6 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">{scopes.map((item) => <section key={item.scope} className={`panel p-5 ${item.scope === "FACTORY" || item.scope === "MASTER_DATA" ? "border-red-500" : ""}`}><h2 className="text-xl font-black uppercase">{item.title}</h2><p className="mt-2 min-h-10 text-sm text-gray-600">{item.details}</p><form action="/api/admin/reset" method="post" className="mt-4 space-y-3"><input type="hidden" name="scope" value={item.scope}/><label className="block"><span className="label">Confirmation phrase</span><input name="confirmation" required placeholder={item.phrase} className="mt-1 w-full border border-line p-3 font-mono"/></label><SubmitButton className={`w-full ${item.scope === "FACTORY" || item.scope === "MASTER_DATA" ? "btn border-red-700 bg-red-700 text-white" : "btn-ghost"}`} pendingLabel="Working…">{item.title}</SubmitButton></form></section>)}</div></main>;
}
