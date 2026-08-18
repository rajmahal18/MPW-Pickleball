import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Settings2, UserRoundPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import PlayerAvatar from "@/components/PlayerAvatar";
import SubmitButton from "@/components/SubmitButton";
import PlayerBulkToolbar from "@/components/PlayerBulkToolbar";
import SelectAllPlayers from "@/components/SelectAllPlayers";
import { formatPlayerDisplayName } from "@/lib/player-name";
import AvatarPlayerSelect from "@/components/AvatarPlayerSelect";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const SORT_OPTIONS = ["NAME_ASC", "NAME_DESC", "OFFICE_ASC", "STATUS_ASC", "TEAM_ASC"] as const;

function Field({ label, name, required, type = "text" }: { label: string; name: string; required?: boolean; type?: string }) {
  return <label className="block"><span className="label">{label}</span><input type={type} name={name} required={required} className="mt-1 w-full border border-line bg-white p-2 text-sm font-bold"/></label>;
}

function StatusBadge({ status, assigned, active }: { status: string; assigned: boolean; active: boolean }) {
  const style = !active || status === "WITHDRAWN" ? "border-gray-300 bg-gray-100 text-gray-600" : status === "CONFIRMED" ? "border-court/30 bg-court/10 text-court" : status === "UNAVAILABLE" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-gold bg-gold/20 text-ink";
  return <span className={`inline-flex border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${style}`}>{!active ? "Inactive" : assigned && status === "CONFIRMED" ? "Assigned" : status.replaceAll("_", " ")}</span>;
}

function pageHref(query: { q?: string; status?: string; division?: string; assignment?: string; sex?: string; employment?: string; office?: string; sort?: string }, page: number) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status && query.status !== "ALL") params.set("status", query.status);
  if (query.division) params.set("division", query.division);
  if (query.assignment && query.assignment !== "ALL") params.set("assignment", query.assignment);
  if (query.sex && query.sex !== "ALL") params.set("sex", query.sex);
  if (query.employment && query.employment !== "ALL") params.set("employment", query.employment);
  if (query.office) params.set("office", query.office);
  if (query.sort && query.sort !== "NAME_ASC") params.set("sort", query.sort);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return `/admin/players${suffix ? `?${suffix}` : ""}`;
}

function playerOrderBy(sort: typeof SORT_OPTIONS[number]): Prisma.PlayerOrderByWithRelationInput[] {
  if (sort === "OFFICE_ASC") return [{ office: "asc" }, { lastName: "asc" }, { firstName: "asc" }, { id: "asc" }];
  if (sort === "STATUS_ASC") return [{ participationStatus: "asc" }, { lastName: "asc" }, { firstName: "asc" }, { id: "asc" }];
  if (sort === "TEAM_ASC") return [{ team: { shortName: "asc" } }, { lastName: "asc" }, { firstName: "asc" }, { id: "asc" }];
  if (sort === "NAME_DESC") return [{ lastName: "desc" }, { firstName: "desc" }, { id: "desc" }];
  return [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }];
}

export default async function AdminPlayers({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; q?: string; status?: string; division?: string; assignment?: string; sex?: string; employment?: string; office?: string; sort?: string; page?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SUPERADMIN") redirect("/login");
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  if (!tournament) return <main className="admin-shell">No tournament.</main>;

  const divisions = await prisma.division.findMany({
    where: { tournamentId: tournament.id },
    select: { id: true, name: true, sortOrder: true, entrantType: true, sexCategory: true, teams: { select: { id: true, name: true, shortName: true }, orderBy: { shortName: "asc" } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const search = String(query.q || "").trim();
  const status = ["ALL", "POOL", "CONFIRMED", "UNAVAILABLE", "WITHDRAWN"].includes(String(query.status)) ? String(query.status || "ALL") : "ALL";
  const assignment = ["ALL", "ASSIGNED", "UNASSIGNED"].includes(String(query.assignment)) ? String(query.assignment || "ALL") : "ALL";
  const sex = ["ALL", "MALE", "FEMALE"].includes(String(query.sex)) ? String(query.sex || "ALL") : "ALL";
  const employment = ["ALL", "PERMANENT", "JOB_ORDER", "UNSET"].includes(String(query.employment)) ? String(query.employment || "ALL") : "ALL";
  const sort = SORT_OPTIONS.includes(query.sort as typeof SORT_OPTIONS[number]) ? query.sort as typeof SORT_OPTIONS[number] : "NAME_ASC";
  const divisionId = divisions.some((division) => division.id === query.division) ? String(query.division) : "";
  const office = String(query.office || "").trim();
  const requestedPage = Math.max(1, Number.parseInt(String(query.page || "1"), 10) || 1);

  const where: Prisma.PlayerWhereInput = {
    tournamentId: tournament.id,
    ...(status !== "ALL" ? { participationStatus: status as "POOL" | "CONFIRMED" | "UNAVAILABLE" | "WITHDRAWN" } : {}),
    ...(assignment === "ASSIGNED" ? { teamId: { not: null } } : {}),
    ...(assignment === "UNASSIGNED" ? { teamId: null } : {}),
    ...(sex !== "ALL" ? { sex: sex as "MALE" | "FEMALE" } : {}),
    ...(employment === "UNSET" ? { employmentType: null } : employment !== "ALL" ? { employmentType: employment as "PERMANENT" | "JOB_ORDER" } : {}),
    ...(office ? { office } : {}),
    ...(divisionId ? { divisionEntries: { some: { divisionId } } } : {}),
    ...(search ? { OR: [
      { firstName: { contains: search, mode: "insensitive" } },
      { middleInitial: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { displayName: { contains: search, mode: "insensitive" } },
      { office: { contains: search, mode: "insensitive" } },
      { team: { name: { contains: search, mode: "insensitive" } } },
      { team: { shortName: { contains: search, mode: "insensitive" } } },
    ] } : {}),
  };

  const [filteredCount, statusCounts, assignedCount, unassignedConfirmed, officeRows] = await Promise.all([
    prisma.player.count({ where }),
    prisma.player.groupBy({ by: ["participationStatus"], where: { tournamentId: tournament.id }, _count: { _all: true } }),
    prisma.player.count({ where: { tournamentId: tournament.id, teamId: { not: null } } }),
    prisma.player.findMany({
      where: { tournamentId: tournament.id, isActive: true, participationStatus: "CONFIRMED" },
      select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, avatarUrl: true, office: true, sex: true, pairAsA: { where: { isActive: true }, select: { team: { select: { divisionId: true } } } }, pairAsB: { where: { isActive: true }, select: { team: { select: { divisionId: true } } } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 250,
    }),
    prisma.player.findMany({
      where: { tournamentId: tournament.id, office: { not: null } },
      select: { office: true },
      distinct: ["office"],
      orderBy: { office: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const players = await prisma.player.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      middleInitial: true,
      lastName: true,
      displayName: true,
      avatarUrl: true,
      sex: true,
      employmentType: true,
      office: true,
      isActive: true,
      participationStatus: true,
      teamId: true,
      team: { select: { id: true, shortName: true, name: true, division: { select: { id: true, name: true } }, group: { select: { name: true } } } },
      divisionEntries: { select: { id: true, status: true, division: { select: { id: true, name: true, sortOrder: true } } }, orderBy: { division: { sortOrder: "asc" } } },
    },
    orderBy: playerOrderBy(sort),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const teams = divisions.filter((division) => division.entrantType === "TEAM").flatMap((division) => division.teams.map((team) => ({ ...team, divisionName: division.name })));
  const pairDivisions = divisions.filter((division) => division.entrantType === "PAIR");
  const countByStatus = new Map(statusCounts.map((row) => [row.participationStatus, row._count._all]));
  const offices = officeRows.map((row) => row.office).filter((value): value is string => Boolean(value));

  return <main className="admin-shell">
    <AdminNav role={user.role}/><FlashMessage success={query.success} error={query.error}/>

    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="label text-court">Attendance and assignment</div>
        <h1 className="text-3xl font-black uppercase text-ink md:text-4xl">Player Pool</h1>
        <p className="mt-2 hidden max-w-3xl text-sm text-gray-600 md:block">Fast tournament-day view. Search, select several players, and update assignment or attendance in one action. Open a player only when you need to edit identity details.</p>
      </div>
      <Link href="/admin/tournament" className="btn-ghost"><Settings2 size={16}/> Teams & tournament setup</Link>
    </div>

    <div className="mt-5 grid gap-3 grid-cols-2 sm:grid-cols-4">
      <div className="panel p-4"><div className="text-2xl font-black">{countByStatus.get("CONFIRMED") ?? 0}</div><div className="label">Confirmed</div></div>
      <div className="panel p-4"><div className="text-2xl font-black">{countByStatus.get("POOL") ?? 0}</div><div className="label">Pool</div></div>
      <div className="panel p-4"><div className="text-2xl font-black">{assignedCount}</div><div className="label">Assigned</div></div>
      <div className="panel p-4"><div className="text-2xl font-black">{filteredCount}</div><div className="label">Matching filters</div></div>
    </div>

    <section className="mt-5 border border-line bg-white p-4">
      <form action="/admin/players" className="space-y-3 md:hidden">
        <label className="block"><span className="label">Search players</span><input name="q" defaultValue={search} placeholder="Name, office, or team" className="mt-1 w-full border border-line p-3"/></label>
        <div className="grid grid-cols-2 gap-3">
          <label><span className="label">Attendance</span><select name="status" defaultValue={status} className="mt-1 w-full border border-line p-3 font-bold"><option value="ALL">All</option><option value="POOL">Pool</option><option value="CONFIRMED">Confirmed</option><option value="UNAVAILABLE">Unavailable</option><option value="WITHDRAWN">Withdrawn</option></select></label>
          <label><span className="label">Assignment</span><select name="assignment" defaultValue={assignment} className="mt-1 w-full border border-line p-3 font-bold"><option value="ALL">All</option><option value="UNASSIGNED">Unassigned</option><option value="ASSIGNED">Assigned</option></select></label>
        </div>
        <details className="border border-line bg-paper">
          <summary className="cursor-pointer px-3 py-2 text-xs font-black uppercase text-gray-600">More filters</summary>
          <div className="grid grid-cols-2 gap-3 border-t border-line p-3">
            <label className="col-span-2"><span className="label">Division</span><select name="division" defaultValue={divisionId} className="mt-1 w-full border border-line p-3 font-bold"><option value="">All divisions</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label>
            <label className="col-span-2"><span className="label">Office / DEO</span><select name="office" defaultValue={office} className="mt-1 w-full border border-line p-3 font-bold"><option value="">All offices</option>{offices.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span className="label">Sex</span><select name="sex" defaultValue={sex} className="mt-1 w-full border border-line p-3 font-bold"><option value="ALL">All</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
            <label><span className="label">Employment</span><select name="employment" defaultValue={employment} className="mt-1 w-full border border-line p-3 font-bold"><option value="ALL">All</option><option value="PERMANENT">Permanent</option><option value="JOB_ORDER">Job Order</option><option value="UNSET">Not set</option></select></label>
            <label className="col-span-2"><span className="label">Sort</span><select name="sort" defaultValue={sort} className="mt-1 w-full border border-line p-3 font-bold"><option value="NAME_ASC">Name A-Z</option><option value="NAME_DESC">Name Z-A</option><option value="OFFICE_ASC">Office then name</option><option value="STATUS_ASC">Attendance then name</option><option value="TEAM_ASC">Team then name</option></select></label>
          </div>
        </details>
        <div className="grid grid-cols-2 gap-2"><SubmitButton className="btn-primary w-full" pendingLabel="Filtering…">Apply</SubmitButton><Link href="/admin/players" className="btn-ghost justify-center">Clear</Link></div>
      </form>

      <form action="/admin/players" className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-[1fr_150px_170px_170px] 2xl:grid-cols-[1fr_150px_170px_170px_190px_160px_170px_auto] xl:items-end">
        <label><span className="label">Search</span><input name="q" defaultValue={search} placeholder="Name, office, or team" className="mt-1 w-full border border-line p-3"/></label>
        <label><span className="label">Attendance</span><select name="status" defaultValue={status} className="mt-1 w-full border border-line p-3 font-bold"><option value="ALL">All statuses</option><option value="POOL">Pool</option><option value="CONFIRMED">Confirmed</option><option value="UNAVAILABLE">Unavailable</option><option value="WITHDRAWN">Withdrawn</option></select></label>
        <label><span className="label">Division</span><select name="division" defaultValue={divisionId} className="mt-1 w-full border border-line p-3 font-bold"><option value="">All divisions</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label>
        <label><span className="label">Assignment</span><select name="assignment" defaultValue={assignment} className="mt-1 w-full border border-line p-3 font-bold"><option value="ALL">All</option><option value="UNASSIGNED">Unassigned</option><option value="ASSIGNED">Assigned</option></select></label>
        <label><span className="label">Office / DEO</span><select name="office" defaultValue={office} className="mt-1 w-full border border-line p-3 font-bold"><option value="">All offices</option>{offices.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span className="label">Sex</span><select name="sex" defaultValue={sex} className="mt-1 w-full border border-line p-3 font-bold"><option value="ALL">All</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
        <label><span className="label">Employment</span><select name="employment" defaultValue={employment} className="mt-1 w-full border border-line p-3 font-bold"><option value="ALL">All</option><option value="PERMANENT">Permanent</option><option value="JOB_ORDER">Job Order</option><option value="UNSET">Not set</option></select></label>
        <label><span className="label">Sort</span><select name="sort" defaultValue={sort} className="mt-1 w-full border border-line p-3 font-bold"><option value="NAME_ASC">Name A-Z</option><option value="NAME_DESC">Name Z-A</option><option value="OFFICE_ASC">Office then name</option><option value="STATUS_ASC">Attendance then name</option><option value="TEAM_ASC">Team then name</option></select></label>
        <div className="flex gap-2"><SubmitButton pendingLabel="Filtering…">Apply</SubmitButton><Link href="/admin/players" className="btn-ghost">Clear</Link></div>
      </form>
    </section>

    <details className="mt-5 border border-line bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-black uppercase text-court"><UserRoundPlus size={16}/> Add player</summary>
      <form action="/api/admin/master-data" method="post" className="grid gap-3 border-t border-line p-4 md:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <input type="hidden" name="action" value="create-player"/>
        <Field label="First name" name="firstName" required/>
        <Field label="Middle initial" name="middleInitial"/>
        <Field label="Last name" name="lastName" required/>
        <Field label="Nickname / display name" name="displayName"/>
        <label><span className="label">Sex</span><select name="sex" className="mt-1 w-full border border-line p-2 text-sm font-bold"><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
        <label><span className="label">Employment</span><select name="employmentType" className="mt-1 w-full border border-line p-2 text-sm font-bold"><option value="">Not set</option><option value="PERMANENT">Permanent</option><option value="JOB_ORDER">Job Order</option></select></label>
        <Field label="Office / DEO" name="office"/>
        <label><span className="label">Attendance</span><select name="participationStatus" defaultValue="POOL" className="mt-1 w-full border border-line p-2 text-sm font-bold"><option value="POOL">Pool / tentative</option><option value="CONFIRMED">Confirmed</option><option value="UNAVAILABLE">Unavailable</option><option value="WITHDRAWN">Withdrawn</option></select></label>
        <label className="md:col-span-2"><span className="label">Initial division (optional)</span><select name="divisionId" className="mt-1 w-full border border-line p-2 text-sm font-bold"><option value="">Not set yet</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label>
        <label className="md:col-span-2"><span className="label">Initial team (optional)</span><select name="teamId" className="mt-1 w-full border border-line p-2 text-sm font-bold"><option value="">Unassigned</option>{divisions.filter((division) => division.entrantType === "TEAM").map((division) => <optgroup key={division.id} label={division.name}>{division.teams.map((team) => <option key={team.id} value={team.id}>{team.shortName} — {team.name}</option>)}</optgroup>)}</select></label>
        <SubmitButton className="btn-primary md:col-span-2 lg:col-span-4" pendingLabel="Adding…">Add to player pool</SubmitButton>
      </form>
    </details>

    {pairDivisions.length > 0 && <details className="mt-5 border border-line bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-black uppercase text-gray-600">Advanced · create Executive pair entrant</summary>
      <div className="border-t border-line bg-paper px-4 py-3 text-xs text-gray-600">Executive entrants are fixed pairs. This does not remove a player from an existing Team Event roster; the pair is a separate event entry. Team Event playing pairs still come from team-manager lineups.</div>
      <div className="grid gap-4 border-t border-line p-4 xl:grid-cols-2">
        {pairDivisions.map((division) => {
          const candidates = unassignedConfirmed.filter((player) => (!division.sexCategory || player.sex === division.sexCategory) && ![...player.pairAsA, ...player.pairAsB].some((pair) => pair.team.divisionId === division.id));
          return <div key={division.id} className="rounded-lg border border-line bg-paper/40 p-4">
            <div className="mb-3"><div className="label text-court">{division.sexCategory === "MALE" ? "Men's pair event" : division.sexCategory === "FEMALE" ? "Women's pair event" : "Open pair event"}</div><h3 className="font-black uppercase">{division.name}</h3><p className="mt-1 text-xs text-gray-500">{candidates.length} eligible confirmed player{candidates.length === 1 ? "" : "s"} not yet locked into a pair in this event.</p></div>
            {candidates.length >= 2 ? <form action="/api/admin/master-data" method="post" className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="action" value="create-pair-unit"/><input type="hidden" name="divisionId" value={division.id}/>
              <Field label="Pair name (optional)" name="name"/><Field label="Short label (optional)" name="shortName"/>
              <div><span className="label">Player A</span><div className="mt-1"><AvatarPlayerSelect name="playerAId" value="" placeholder="Select player A…" options={candidates.map((player) => ({ id: player.id, label: formatPlayerDisplayName(player), meta: player.office || "Confirmed", avatar: player }))}/></div></div>
              <div><span className="label">Player B</span><div className="mt-1"><AvatarPlayerSelect name="playerBId" value="" placeholder="Select player B…" options={candidates.map((player) => ({ id: player.id, label: formatPlayerDisplayName(player), meta: player.office || "Confirmed", avatar: player }))}/></div></div>
              <SubmitButton className="btn-primary md:col-span-2" pendingLabel="Creating pair…">Create pair entrant</SubmitButton>
            </form> : <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-950">At least two eligible confirmed players are needed for this event.</div>}
          </div>;
        })}
      </div>
    </details>}

    <section className="mt-5 border border-line bg-white">
      <div className="border-b border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="label">Batch operations</div><h2 className="text-lg font-black uppercase">Select players below</h2><p className="mt-1 text-xs text-gray-500">Only the checked players on this page are changed.</p></div>
          <div className="text-xs font-bold text-gray-500">Page {page} of {totalPages} · {players.length} shown</div>
        </div>
        <div className="mt-3"><PlayerBulkToolbar teams={teams} divisions={divisions.map(({ id, name }) => ({ id, name }))}/></div>
      </div>

      <div className="divide-y divide-line md:hidden">
        {players.length ? players.map((player) => <div key={player.id} className="p-4">
          <div className="flex items-start gap-3">
            <input form="player-bulk-form" type="checkbox" name="playerIds" value={player.id} aria-label={`Select ${formatPlayerDisplayName(player)}`} className="mt-2 h-5 w-5 shrink-0"/>
            <PlayerAvatar {...player} size="sm"/>
            <div className="min-w-0 flex-1">
              <div className="truncate font-black">{formatPlayerDisplayName(player)}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5"><StatusBadge status={player.participationStatus} assigned={Boolean(player.teamId)} active={player.isActive}/>{player.team ? <span className="border border-line bg-paper px-2 py-1 text-[10px] font-black">{player.team.shortName}</span> : <span className="text-xs font-bold text-gray-400">Unassigned</span>}</div>
              <div className="mt-2 truncate text-xs text-gray-500">{player.office || "Office not set"}{player.team ? ` · ${player.team.division.name}${player.team.group ? ` / ${player.team.group.name}` : ""}` : ""}</div>
            </div>
            <Link href={`/admin/players/${player.id}`} className="btn-ghost shrink-0 px-3 py-2 text-xs">Edit</Link>
          </div>
        </div>) : <div className="p-8 text-center text-sm text-gray-500">No players match these filters.</div>}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-ink text-left text-white"><tr><th className="w-16 p-3"><SelectAllPlayers/></th><th className="p-3">Player</th><th className="p-3">Office</th><th className="p-3">Attendance</th><th className="p-3">Team</th><th className="p-3">Division status</th><th className="w-24 p-3"></th></tr></thead>
          <tbody>{players.length ? players.map((player) => <tr key={player.id} className="border-b border-line align-middle hover:bg-paper/70">
            <td className="p-3"><input form="player-bulk-form" type="checkbox" name="playerIds" value={player.id} aria-label={`Select ${formatPlayerDisplayName(player)}`} className="h-4 w-4"/></td>
            <td className="p-3"><div className="flex items-center gap-3"><PlayerAvatar {...player} size="sm"/><div><div className="font-black">{formatPlayerDisplayName(player)}</div>{player.displayName && <div className="text-xs text-gray-500">{[player.firstName, player.middleInitial, player.lastName].filter(Boolean).join(" ")}</div>}<div className="mt-1 text-[11px] text-gray-500">{player.sex === "MALE" ? "Male" : "Female"}{player.employmentType ? ` · ${player.employmentType === "JOB_ORDER" ? "Job Order" : "Permanent"}` : ""}</div></div></div></td>
            <td className="p-3 text-xs font-bold text-gray-700">{player.office || "—"}</td>
            <td className="p-3"><StatusBadge status={player.participationStatus} assigned={Boolean(player.teamId)} active={player.isActive}/></td>
            <td className="p-3">{player.team ? <><div className="font-black">{player.team.shortName}</div><div className="text-xs text-gray-500">{player.team.division.name}{player.team.group ? ` · ${player.team.group.name}` : ""}</div></> : <span className="text-gray-400">Unassigned</span>}</td>
            <td className="p-3"><div className="flex max-w-64 flex-wrap gap-1">{player.divisionEntries.length ? player.divisionEntries.map((entry) => <span key={entry.id} className="border border-line bg-white px-2 py-1 text-[10px] font-bold">{entry.division.name}: {entry.status}</span>) : <span className="text-xs text-gray-400">Not set</span>}</div></td>
            <td className="p-3 text-right"><Link href={`/admin/players/${player.id}`} className="btn-ghost px-3 py-2 text-xs">Edit</Link></td>
          </tr>) : <tr><td colSpan={7} className="p-10 text-center text-gray-500">No players match these filters.</td></tr>}</tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 p-4">
        <Link href={pageHref({ q: search, status, division: divisionId, assignment, sex, employment, office, sort }, Math.max(1, page - 1))} className={`btn-ghost px-3 py-2 ${page === 1 ? "pointer-events-none opacity-40" : ""}`}><ChevronLeft size={15}/> Previous</Link>
        <span className="text-xs font-bold text-gray-500">{filteredCount ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredCount)} of ${filteredCount}` : "0 results"}</span>
        <Link href={pageHref({ q: search, status, division: divisionId, assignment, sex, employment, office, sort }, Math.min(totalPages, page + 1))} className={`btn-ghost px-3 py-2 ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}>Next <ChevronRight size={15}/></Link>
      </div>
    </section>
  </main>;
}
