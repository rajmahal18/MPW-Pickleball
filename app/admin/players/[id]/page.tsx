import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import PlayerAvatar from "@/components/PlayerAvatar";
import SubmitButton from "@/components/SubmitButton";
import { formatPlayerDisplayName, formatPlayerFullName } from "@/lib/player-name";

export const dynamic = "force-dynamic";

function Field({ label, name, defaultValue, required, help }: { label: string; name: string; defaultValue?: string | null; required?: boolean; help?: string }) {
  return <label className="block"><span className="label">{label}</span><input name={name} defaultValue={defaultValue || ""} required={required} className="mt-1 w-full border border-line bg-white p-3 text-sm font-bold"/>{help && <span className="mt-1 block text-xs text-gray-500">{help}</span>}</label>;
}

export default async function PlayerEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");
  const { id } = await params;
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!tournament) notFound();

  const [player, divisions] = await Promise.all([
    prisma.player.findFirst({
      where: { id, tournamentId: tournament.id },
      include: {
        team: { include: { division: true, group: true } },
        divisionEntries: { include: { division: true }, orderBy: { division: { sortOrder: "asc" } } },
      },
    }),
    prisma.division.findMany({
      where: { tournamentId: tournament.id },
      select: { id: true, name: true, sortOrder: true, teams: { select: { id: true, name: true, shortName: true }, orderBy: { shortName: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  if (!player) notFound();

  return <main className="admin-shell">
    <AdminNav/>
    <FlashMessage success={query.success} error={query.error}/>
    <Link href="/admin/players" className="inline-flex items-center gap-2 text-sm font-black text-court"><ArrowLeft size={16}/> Back to Player Pool</Link>

    <section className="mt-4 border border-line bg-white">
      <div className="flex flex-wrap items-center gap-4 border-b border-line bg-paper p-5">
        <PlayerAvatar {...player} size="md"/>
        <div className="min-w-0 flex-1"><div className="label text-court">Player record</div><h1 className="truncate text-3xl font-black uppercase">{formatPlayerDisplayName(player)}</h1>{player.displayName && <p className="mt-1 text-sm text-gray-500">Official name: {formatPlayerFullName(player)}</p>}</div>
        <div className="text-right text-xs text-gray-500">{player.team ? <><div className="font-black text-ink">{player.team.division.name}</div><div>{player.team.shortName} — {player.team.name}</div></> : <div className="font-black">Unassigned</div>}</div>
      </div>

      <div className="grid gap-6 p-5 xl:grid-cols-[1fr_300px]">
        <form action="/api/admin/master-data" method="post" className="space-y-5">
          <input type="hidden" name="action" value="update-player"/>
          <input type="hidden" name="playerId" value={player.id}/>

          <section><div className="label">Identity</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="First name" name="firstName" defaultValue={player.firstName} required/><Field label="Middle initial" name="middleInitial" defaultValue={player.middleInitial} help="Example: A. Leave blank if none."/><Field label="Last name" name="lastName" defaultValue={player.lastName} required/><Field label="Nickname / display name" name="displayName" defaultValue={player.displayName} help="Optional short tournament name."/></div></section>

          <section className="border-t border-line pt-5"><div className="label">Roster details</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="label">Sex</span><select name="sex" defaultValue={player.sex} className="mt-1 w-full border border-line p-3 text-sm font-bold"><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label><label><span className="label">Employment</span><select name="employmentType" defaultValue={player.employmentType ?? ""} className="mt-1 w-full border border-line p-3 text-sm font-bold"><option value="">Not set</option><option value="PERMANENT">Permanent</option><option value="JOB_ORDER">Job Order</option></select></label><Field label="Office / DEO" name="office" defaultValue={player.office}/><label><span className="label">Attendance</span><select name="participationStatus" defaultValue={player.participationStatus} className="mt-1 w-full border border-line p-3 text-sm font-bold"><option value="POOL">Pool / tentative</option><option value="CONFIRMED">Confirmed</option><option value="UNAVAILABLE">Unavailable</option><option value="WITHDRAWN">Withdrawn</option></select></label></div></section>

          <section className="border-t border-line pt-5"><div className="label">Assignment</div><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]"><label><span className="label">Team</span><select name="teamId" defaultValue={player.teamId ?? ""} className="mt-1 w-full border border-line p-3 text-sm font-bold"><option value="">Unassigned / player pool</option>{divisions.map((division) => <optgroup key={division.id} label={division.name}>{division.teams.map((team) => <option key={team.id} value={team.id}>{team.shortName} — {team.name}</option>)}</optgroup>)}</select></label><label className="mt-[17px] flex min-h-12 items-center gap-3 border border-line bg-paper px-3 text-sm font-bold"><input type="checkbox" name="isActive" defaultChecked={player.isActive}/> Active player</label></div><p className="mt-2 text-xs text-gray-500">Recorded play protects historical team assignment. Unplayed future lineup pairings are released automatically if you move the player.</p></section>

          <SubmitButton pendingLabel="Saving player…">Save player</SubmitButton>
        </form>

        <aside className="space-y-4">
          <section className="border border-line bg-paper p-4"><div className="label">Avatar</div><div className="mt-3 flex justify-center"><PlayerAvatar {...player} size="lg"/></div><form action={`/api/admin/players/${player.id}/avatar`} method="post" encType="multipart/form-data" className="mt-3"><input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" required className="w-full text-xs"/><div className="mt-1 text-xs text-gray-500">JPEG, PNG, or WebP · up to 10 MB.</div><SubmitButton className="btn-ghost mt-2 w-full" pendingLabel="Uploading…">Upload avatar</SubmitButton></form></section>

          <section className="border border-line bg-white p-4"><div className="label">Division eligibility</div><div className="mt-3 space-y-2">{player.divisionEntries.length ? player.divisionEntries.map((entry) => <div key={entry.id} className="border border-line bg-paper p-2 text-xs"><div className="font-black">{entry.division.name}</div><div className="mt-1 text-gray-500">{entry.status}</div></div>) : <div className="text-sm text-gray-500">No division status set.</div>}</div><form action="/api/admin/master-data" method="post" className="mt-3 grid gap-2"><input type="hidden" name="action" value="set-division-status"/><input type="hidden" name="playerId" value={player.id}/><label><span className="label">Division</span><select name="divisionId" className="mt-1 w-full border border-line p-2 text-xs">{divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label><label><span className="label">Status</span><select name="status" className="mt-1 w-full border border-line p-2 text-xs"><option value="ELIGIBLE">Eligible</option><option value="CONFIRMED">Confirmed</option><option value="UNAVAILABLE">Unavailable</option><option value="WITHDRAWN">Withdrawn</option></select></label><SubmitButton className="btn-ghost" pendingLabel="Saving…">Update eligibility</SubmitButton></form></section>
        </aside>
      </div>
    </section>
  </main>;
}
