import type { InputHTMLAttributes } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SUPERADMIN") redirect("/login");
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!tournament) return <main className="admin-shell"><AdminNav role={user.role}/><div>No tournament.</div></main>;

  const [users, teams] = await Promise.all([
    prisma.user.findMany({ include: { team: { select: { id: true, name: true, shortName: true } } }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.team.findMany({
      where: { division: { tournamentId: tournament.id, entrantType: "TEAM" } },
      select: { id: true, name: true, shortName: true, division: { select: { name: true } } },
      orderBy: [{ division: { sortOrder: "asc" } }, { shortName: "asc" }],
    }),
  ]);

  return <main className="admin-shell">
    <AdminNav role={user.role}/>
    <FlashMessage {...query}/>
    <div className="label text-court">Superadmin only</div>
    <h1 className="text-3xl font-black uppercase md:text-4xl">Accounts & Roles</h1>
    <p className="mt-2 max-w-3xl text-sm text-gray-600">Admins can operate live matches and scores. Team Managers can only submit lineups for their assigned team. Tournament setup and system controls remain Superadmin-only.</p>

    <section className="panel mt-6 p-5">
      <h2 className="text-xl font-black uppercase">Create account</h2>
      <form action="/api/admin/accounts" method="post" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5 xl:items-end">
        <input type="hidden" name="action" value="create"/>
        <Field label="Name" name="name" required/>
        <Field label="Email" name="email" type="email" required/>
        <Field label="Temporary password" name="password" type="password" minLength={8} required/>
        <label><span className="label">Role</span><select name="role" defaultValue="ADMIN" className="mt-1 w-full border border-line p-3 text-sm font-bold"><option value="ADMIN">Admin · live operations</option><option value="TEAM_MANAGER">Team Manager · lineup only</option></select></label>
        <label><span className="label">Assigned team</span><select name="teamId" defaultValue="" className="mt-1 w-full border border-line p-3 text-sm font-bold"><option value="">None / Admin</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.shortName} · {team.name}</option>)}</select></label>
        <SubmitButton className="btn-primary xl:col-span-5" pendingLabel="Creating…">Create account</SubmitButton>
      </form>
    </section>

    <section className="panel mt-6 overflow-hidden">
      <div className="border-b border-line bg-paper p-4"><h2 className="text-xl font-black uppercase">Current accounts</h2></div>
      <div className="divide-y divide-line">{users.map((account) => <div key={account.id} className="grid gap-3 p-4 lg:grid-cols-[1.1fr_1fr_1.5fr_auto] lg:items-end">
        <div><div className="font-black">{account.name}</div><div className="text-xs text-gray-500">{account.email}</div></div>
        <div><div className="label">Role</div><div className="mt-1 font-black">{account.role === "SUPERADMIN" ? "Superadmin" : account.role === "TEAM_MANAGER" ? "Team Manager" : "Admin"}</div></div>
        {account.role === "SUPERADMIN" && account.id === user.id ? <div className="text-sm font-bold text-court">Current Superadmin · protected.</div> : <form action="/api/admin/accounts" method="post" className="grid gap-2 sm:grid-cols-3 sm:items-end">
          <input type="hidden" name="action" value="update"/><input type="hidden" name="userId" value={account.id}/>
          <label><span className="label">Role</span><select name="role" defaultValue={account.role === "SUPERADMIN" ? "ADMIN" : account.role} className="mt-1 w-full border border-line p-2 text-sm font-bold"><option value="ADMIN">Admin</option><option value="TEAM_MANAGER">Team Manager</option></select></label>
          <label><span className="label">Team</span><select name="teamId" defaultValue={account.teamId || ""} className="mt-1 w-full border border-line p-2 text-sm font-bold"><option value="">None</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.shortName} · {team.name}</option>)}</select></label>
          <SubmitButton className="btn-ghost px-3 py-2 text-xs" pendingLabel="Saving…">{account.role === "SUPERADMIN" ? "Demote" : "Save role"}</SubmitButton>
        </form>}
        {account.role !== "SUPERADMIN" && <details className="lg:text-right"><summary className="cursor-pointer text-xs font-black uppercase text-gray-500">Password / remove</summary><div className="mt-2 space-y-2 lg:min-w-60"><form action="/api/admin/accounts" method="post" className="flex gap-2"><input type="hidden" name="action" value="password"/><input type="hidden" name="userId" value={account.id}/><input name="password" type="password" minLength={8} required placeholder="New password" className="min-w-0 flex-1 border border-line p-2 text-xs"/><SubmitButton className="btn-ghost px-2 py-1 text-xs" pendingLabel="…">Reset</SubmitButton></form><form action="/api/admin/accounts" method="post"><input type="hidden" name="action" value="delete"/><input type="hidden" name="userId" value={account.id}/><SubmitButton className="btn-ghost w-full px-2 py-1 text-xs text-red-700" pendingLabel="Removing…">Remove account</SubmitButton></form></div></details>}
      </div>)}</div>
    </section>
  </main>;
}

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label><span className="label">{label}</span><input className="mt-1 w-full border border-line p-3 text-sm font-bold" {...props}/></label>;
}
