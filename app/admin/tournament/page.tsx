import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import SubmitButton from "@/components/SubmitButton";
import TournamentCourtBoard, { type CourtQueueMatchup } from "@/components/TournamentCourtBoard";
import TournamentSetupTabs from "@/components/TournamentSetupTabs";
import QuarterfinalSeedMapper from "@/components/QuarterfinalSeedMapper";
import { formatPlayerDisplayName } from "@/lib/player-name";
import { computeStandings, type StandingRow } from "@/lib/tournament/standings";
import { displayStatus } from "@/components/StatusBadge";
import { categoryLabel, defaultCategoryPattern } from "@/lib/tournament/rules";
import { qualificationSourceOptions } from "@/lib/tournament/bracket-seeding";

export const dynamic = "force-dynamic";

const formats = ["GROUP_KNOCKOUT", "ROUND_ROBIN", "SINGLE_ELIMINATION", "CUSTOM"] as const;
const stages = ["GROUP", "ROUND_ROBIN", "QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE", "CUSTOM"] as const;
const entrantTypes = ["TEAM", "PLAYER", "PAIR"] as const;

const formatCopy: Record<(typeof formats)[number], string> = {
  GROUP_KNOCKOUT: "Group standings feed the knockout stage when progression is enabled.",
  ROUND_ROBIN: "Configured entrants play through a round-robin structure.",
  SINGLE_ELIMINATION: "Future matchups form the knockout bracket.",
  CUSTOM: "Organizer-controlled structure for flexible or last-minute formats.",
};

const entrantCopy: Record<(typeof entrantTypes)[number], string> = {
  TEAM: "Team Event",
  PLAYER: "Individual player",
  PAIR: "Pair event",
};

function Field({ label, name, defaultValue, type = "text", min, max, required = false, help }: { label: string; name: string; defaultValue?: string | number | null; type?: string; min?: number; max?: number; required?: boolean; help?: string }) {
  return <label className="block"><span className="label">{label}</span><input name={name} type={type} min={min} max={max} defaultValue={defaultValue ?? ""} required={required} className="mt-1 w-full rounded-md border border-line bg-white p-3 text-sm font-bold"/>{help && <span className="mt-1 block text-xs leading-5 text-gray-500">{help}</span>}</label>;
}

function Select({ label, name, defaultValue, children, help }: { label: string; name: string; defaultValue?: string | null; children: React.ReactNode; help?: string }) {
  return <label className="block"><span className="label">{label}</span><select name={name} defaultValue={defaultValue ?? ""} className="mt-1 w-full rounded-md border border-line bg-white p-3 text-sm font-bold">{children}</select>{help && <span className="mt-1 block text-xs leading-5 text-gray-500">{help}</span>}</label>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-line bg-white px-4 py-3"><div className="text-2xl font-black text-ink">{value}</div><div className="label mt-0.5">{label}</div></div>;
}

function SectionHeader({ step, eyebrow, title, action, children }: { step?: number; eyebrow: string; title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
    <div className="flex min-w-0 items-start gap-3">
      {step && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-xs font-black text-white">{step}</span>}
      <div><div className="label text-court">{eyebrow}</div><h2 className="text-xl font-black uppercase text-ink md:text-2xl">{title}</h2>{children && <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">{children}</p>}</div>
    </div>
    {action}
  </div>;
}

function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line bg-paper p-5 text-sm text-gray-500">{text}{action && <div className="mt-3">{action}</div>}</div>;
}

function StatusBadge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "ready" | "warn" | "locked" }) {
  const styles = tone === "ready" ? "border-court/30 bg-court/10 text-court" : tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-950" : tone === "locked" ? "border-gray-300 bg-gray-100 text-gray-700" : "border-line bg-white text-gray-600";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${styles}`}>{children}</span>;
}

function matchupLocked(matchup: { status: string; games: Array<{ status: string; homeScore: number; awayScore: number }> }) {
  return matchup.status === "COMPLETED" || matchup.status === "FORFEITED" || matchup.games.some((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0);
}

function groupCode(group: { name: string; slug: string }) {
  const slugCode = group.slug.trim().replace(/^group-?/i, "").slice(0, 2).toUpperCase();
  if (slugCode) return slugCode;
  const nameCode = group.name.match(/[A-Z0-9]+$/i)?.[0];
  return (nameCode || group.name.slice(0, 1)).toUpperCase();
}

function slotLabel(team: { groupPosition: number | null; group: { name: string; slug: string } | null }) {
  if (!team.group || !team.groupPosition) return "No slot";
  return `${groupCode(team.group)}${team.groupPosition}`;
}


function matchupContextLabel(matchup: { groupLabel: string | null; stage: string; roundLabel: string }) {
  const scope = matchup.groupLabel || matchup.stage.replaceAll("_", " ");
  const round = matchup.roundLabel.trim();
  if (!round || round.toLowerCase() === scope.toLowerCase()) return scope;
  if (matchup.groupLabel && round.toLowerCase().includes(matchup.groupLabel.toLowerCase())) return round;
  return `${scope} · ${round}`;
}

function unresolvedTieSets(rows: StandingRow[]) {
  const groups = new Map<string, StandingRow[]>();
  for (const row of rows) {
    if (row.rankStatus !== "TIED" || !row.tieGroupKey) continue;
    const tied = groups.get(row.tieGroupKey) ?? [];
    tied.push(row);
    groups.set(row.tieGroupKey, tied);
  }
  return [...groups.values()].filter((rows) => rows.length > 1);
}

function queueDto(matchup: {
  id: string;
  queuePosition: number | null;
  courtLabel: string | null;
  gamesPerMatchup: number;
  groupLabel: string | null;
  stage: string;
  roundLabel: string;
  status: string;
  division: { name: string };
  homeTeam: { name: string; shortName: string } | null;
  awayTeam: { name: string; shortName: string } | null;
}): CourtQueueMatchup {
  return {
    id: matchup.id,
    queuePosition: matchup.queuePosition,
    courtLabel: matchup.courtLabel,
    divisionName: matchup.division.name,
    homeName: matchup.homeTeam?.name ?? "TBD",
    awayName: matchup.awayTeam?.name ?? "TBD",
    homeShortName: matchup.homeTeam?.shortName ?? "TBD",
    awayShortName: matchup.awayTeam?.shortName ?? "TBD",
    gamesPerMatchup: matchup.gamesPerMatchup,
    groupLabel: matchup.groupLabel,
    stage: matchup.stage,
    roundLabel: matchup.roundLabel,
    status: matchup.status,
  };
}

export default async function TournamentSetup({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; division?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, activeCourtCount: true } });
  if (!tournament) return <main className="admin-shell">No tournament.</main>;

  const divisions = await prisma.division.findMany({
    where: { tournamentId: tournament.id },
    select: { id: true, name: true, slug: true, sortOrder: true, formatType: true, entrantType: true, isPublic: true, _count: { select: { teams: true, matchups: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const selectedId = divisions.some((division) => division.id === query.division) ? String(query.division) : divisions[0]?.id;
  if (!selectedId) return <main className="admin-shell"><AdminNav/><EmptyState text="No divisions are configured yet."/></main>;

  const selected = await prisma.division.findFirst({
    where: { id: selectedId, tournamentId: tournament.id },
    include: {
      groups: { include: { standingOverrides: true, teams: { include: { group: true }, orderBy: [{ groupPosition: "asc" }, { shortName: "asc" }] } }, orderBy: { name: "asc" } },
      teams: { include: { group: true, players: { select: { id: true, firstName: true, middleInitial: true, lastName: true, displayName: true, participationStatus: true, isActive: true } }, _count: { select: { players: true } } }, orderBy: [{ groupPosition: "asc" }, { shortName: "asc" }] },
      matchups: { include: { homeTeam: true, awayTeam: true, games: { select: { id: true, status: true, homeScore: true, awayScore: true } } }, orderBy: [{ stage: "asc" }, { order: "asc" }] },
      playerEntries: { include: { player: { select: { id: true, isActive: true, teamId: true, participationStatus: true } } } },
    },
  });
  if (!selected) return <main className="admin-shell"><AdminNav/><EmptyState text="Selected division was not found."/></main>;

  const tournamentMatchups = await prisma.matchup.findMany({
    where: { tournamentId: tournament.id },
    include: { division: { select: { name: true, sortOrder: true } }, homeTeam: { select: { name: true, shortName: true } }, awayTeam: { select: { name: true, shortName: true } }, games: { select: { status: true, homeScore: true, awayScore: true } } },
    orderBy: [{ queuePosition: { sort: "asc", nulls: "last" } }, { division: { sortOrder: "asc" } }, { order: "asc" }],
  });
  const queuedMatchups = tournamentMatchups.filter((matchup) => matchup.queuePosition !== null && !["COMPLETED", "FORFEITED"].includes(matchup.status));
  const availableQueueMatchups = tournamentMatchups.filter((matchup) => matchup.queuePosition === null && matchup.homeTeamId && matchup.awayTeamId && !matchupLocked(matchup));

  const confirmedEntries = selected.playerEntries.filter((entry) => entry.status === "CONFIRMED" && entry.player.isActive && entry.player.participationStatus === "CONFIRMED");
  const unassignedConfirmed = confirmedEntries.filter((entry) => !entry.player.teamId || !selected.teams.some((team) => team.id === entry.player.teamId)).length;
  const lockedMatchups = selected.matchups.filter(matchupLocked).length;
  const groupMatchups = selected.matchups.filter((matchup) => matchup.stage === "GROUP");
  const quarterfinals = selected.matchups.filter((matchup) => matchup.stage === "QUARTERFINAL").sort((a, b) => a.order - b.order);
  const expectedQualifierCount = selected.groups.length * Math.max(0, selected.qualifiersPerGroup) + Math.max(0, selected.wildcardCount);
  const qfSourceOptions = qualificationSourceOptions(selected.groups, selected.qualifiersPerGroup, selected.wildcardCount);
  const qfConfigurationLocked = quarterfinals.some(matchupLocked);
  const championFinal = selected.matchups.find((matchup) => matchup.stage === "FINAL" && matchup.winnerTeamId && (matchup.status === "COMPLETED" || matchup.status === "FORFEITED"));
  const championTeam = championFinal ? selected.teams.find((team) => team.id === championFinal.winnerTeamId) : null;

  return <main className="admin-shell">
    <AdminNav />
    <FlashMessage success={query.success} error={query.error} />

    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="label text-court">Tournament administration</div>
        <h1 className="text-3xl font-black uppercase text-ink md:text-4xl">Tournament Setup</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">Configure the tournament in the same order you operate it: division, teams, lineup rules, courts, then future matchups.</p>
      </div>
      <details className="rounded-lg border border-line bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-black uppercase text-court">+ Add division</summary>
        <form action="/api/admin/tournament-structure" method="post" className="grid w-full gap-3 border-t border-line p-4 sm:w-[420px]">
          <input type="hidden" name="action" value="create-division" />
          <input type="hidden" name="sortOrder" value={(divisions.at(-1)?.sortOrder ?? 0) + 10} />
          <input type="hidden" name="qualifiersPerGroup" value="0" />
          <input type="hidden" name="wildcardCount" value="0" />
          <Field label="Division name" name="name" required />
          <Select label="Format" name="formatType" defaultValue="CUSTOM">{formats.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select>
          <Select label="Entrant type" name="entrantType" defaultValue="TEAM">{entrantTypes.map((item) => <option key={item} value={item}>{entrantCopy[item]}</option>)}</Select>
          <div className="grid grid-cols-2 gap-3"><Field label="Group matches" name="defaultGamesPerMatchup" type="number" min={1} max={31} defaultValue={1} required/><Field label="Playoff matches" name="knockoutGamesPerMatchup" type="number" min={1} max={31} defaultValue={1}/></div>
          <SubmitButton className="btn-primary rounded-md text-xs" pendingLabel="Creating...">Create division</SubmitButton>
        </form>
      </details>
    </div>

    <section className="mt-6 overflow-hidden rounded-xl border border-line bg-white shadow-panel">
      <div className="border-b border-line bg-paper px-4 py-3">
        <div className="label">Division</div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {divisions.map((division) => <Link key={division.id} href={`/admin/tournament?division=${division.id}`} className={`shrink-0 rounded-md border px-4 py-3 ${division.id === selected.id ? "border-court bg-court text-white" : "border-line bg-white text-ink hover:border-court"}`}>
            <div className="font-black uppercase">{division.name}</div>
            <div className={`mt-0.5 text-[11px] ${division.id === selected.id ? "text-white/75" : "text-gray-500"}`}>{division._count.teams} teams · {division._count.matchups} matchups</div>
          </Link>)}
        </div>
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="label text-court">Selected division</div><h2 className="text-2xl font-black uppercase text-ink md:text-3xl">{selected.name}</h2><p className="mt-1 text-sm text-gray-600">{formatCopy[selected.formatType]}</p></div>
          <div className="flex flex-wrap gap-2"><StatusBadge>{entrantCopy[selected.entrantType]}</StatusBadge><StatusBadge tone={selected.isPublic ? "ready" : "warn"}>{selected.isPublic ? "Public" : "Private"}</StatusBadge>{lockedMatchups > 0 && <StatusBadge tone="locked">{lockedMatchups} protected</StatusBadge>}</div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Teams / entries" value={selected.teams.length}/><Stat label="Groups" value={selected.groups.length}/><Stat label="Future + played matchups" value={selected.matchups.length}/><Stat label="Confirmed players" value={confirmedEntries.length}/></div>
        {unassignedConfirmed > 0 && <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">{unassignedConfirmed} confirmed player{unassignedConfirmed === 1 ? " is" : "s are"} still unassigned in this division. <Link href="/admin/players" className="underline">Open Player Pool</Link></div>}
      </div>
    </section>

    <TournamentSetupTabs>
      <section id="division-settings" className="scroll-mt-40 rounded-xl border border-line bg-white p-5 shadow-panel">
        <SectionHeader eyebrow="Division" title="Format & settings">Competition structure and match counts.</SectionHeader>
        <form action="/api/admin/tournament-structure" method="post" className="space-y-5">
          <input type="hidden" name="action" value="update-division" />
          <input type="hidden" name="divisionId" value={selected.id} />
          <input type="hidden" name="preserveLineupRules" value="1" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Division name" name="name" defaultValue={selected.name} required />
            <Select label="Tournament format" name="formatType" defaultValue={selected.formatType}>{formats.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select>
            <Select label="Entrant type" name="entrantType" defaultValue={selected.entrantType}>{entrantTypes.map((item) => <option key={item} value={item}>{entrantCopy[item]}</option>)}</Select>
            <Field label="Group / default matches" name="defaultGamesPerMatchup" type="number" min={1} max={31} defaultValue={selected.defaultGamesPerMatchup} required />
            <Field label="Playoff matches" name="knockoutGamesPerMatchup" type="number" min={1} max={31} defaultValue={selected.knockoutGamesPerMatchup ?? selected.defaultGamesPerMatchup} required />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-paper px-3 text-sm font-bold"><input type="checkbox" name="isPublic" defaultChecked={selected.isPublic} /> Public division</label>
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-paper px-3 text-sm font-bold"><input type="checkbox" name="autoProgression" defaultChecked={selected.autoProgression} /> Auto progression</label>
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-paper px-3 text-sm font-bold"><input type="checkbox" name="thirdPlaceEnabled" defaultChecked={selected.thirdPlaceEnabled} /> Battle for 3rd</label>
            <div className="rounded-md border border-line bg-paper px-3 py-2 text-xs font-bold leading-5 text-gray-600"><span className="block text-ink">Scoring</span> Group: 11 sudden death · Playoffs: 11, win by 2, cap 15</div>
          </div>
          {selected.formatType === "GROUP_KNOCKOUT" ? <div className="grid gap-4 rounded-lg border border-court/20 bg-court/5 p-4 md:grid-cols-2"><Field label="Teams advancing per group" name="qualifiersPerGroup" type="number" min={0} max={16} defaultValue={selected.qualifiersPerGroup} required/><Field label="Wildcard slots" name="wildcardCount" type="number" min={0} max={16} defaultValue={selected.wildcardCount} required/></div> : <><input type="hidden" name="qualifiersPerGroup" value={selected.qualifiersPerGroup}/><input type="hidden" name="wildcardCount" value={selected.wildcardCount}/></>}
          <details className="rounded-lg border border-line bg-paper p-4">
            <summary className="cursor-pointer text-sm font-black uppercase text-gray-700">Advanced division fields</summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="URL slug" name="slug" defaultValue={selected.slug} required />
              <Field label="Display order" name="sortOrder" type="number" min={0} max={999} defaultValue={selected.sortOrder} required />
              <label className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-white px-3 text-sm font-bold md:col-span-2"><input type="checkbox" name="suddenDeathAtTen" defaultChecked={selected.suddenDeathAtTen} /> Sudden death for CUSTOM-stage matches</label>
              <label className="block md:col-span-2"><span className="label">Advancement rule</span><textarea name="advancementRule" defaultValue={selected.advancementRule ?? ""} className="mt-1 min-h-20 w-full rounded-md border border-line bg-white p-3 text-sm"/></label>
              <label className="block md:col-span-2"><span className="label">Guide notes</span><textarea name="guideNotes" defaultValue={selected.guideNotes ?? ""} className="mt-1 min-h-20 w-full rounded-md border border-line bg-white p-3 text-sm"/></label>
            </div>
          </details>
          <SubmitButton className="btn-primary rounded-md" pendingLabel="Saving...">Save division</SubmitButton>
        </form>
        {championTeam && <section className="mt-5 rounded-xl border border-gold/50 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="label text-amber-800">Champion media</div><h3 className="mt-1 text-lg font-black uppercase text-ink">{championTeam.name}</h3><p className="mt-1 text-sm text-gray-600">Upload the official champion team photo used by the homepage celebration banner.</p></div>{selected.championImageUrl && selected.championImageTeamId === championTeam.id && <img src={selected.championImageUrl} alt="Current champion team" className="h-20 w-32 rounded-lg border border-amber-200 object-cover"/>}</div>
          <form action={`/api/admin/divisions/${selected.id}/champion-image`} method="post" encType="multipart/form-data" className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1"><span className="label">Champion team photo</span><input type="file" name="championImage" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full rounded-md border border-line bg-white p-2 text-sm"/><span className="mt-1 block text-xs text-gray-500">JPEG, PNG, or WebP · up to 10 MB. Uploading again replaces the current banner photo.</span></label>
            <SubmitButton className="btn-primary rounded-md" pendingLabel="Uploading...">Upload champion photo</SubmitButton>
          </form>
        </section>}
      </section>

      <section id="teams" className="scroll-mt-40 rounded-xl border border-line bg-white p-5 shadow-panel">
        <SectionHeader eyebrow="Entrants" title="Teams & groups" action={<div className="flex flex-wrap gap-2">
          {selected.groups.length > 0 && <form action="/api/admin/tournament-structure" method="post"><input type="hidden" name="action" value="generate-all-group-round-robins"/><input type="hidden" name="divisionId" value={selected.id}/><SubmitButton className="btn-primary rounded-md px-3 py-2 text-xs" pendingLabel="Generating...">Generate all group matchups</SubmitButton></form>}
          <details className="rounded-md border border-line bg-white"><summary className="cursor-pointer list-none px-3 py-2 text-xs font-black uppercase text-court">+ Group</summary><form action="/api/admin/tournament-structure" method="post" className="grid gap-3 border-t border-line p-3 sm:w-80"><input type="hidden" name="action" value="create-group"/><input type="hidden" name="divisionId" value={selected.id}/><Field label="Group name" name="name" required/><Field label="Slug" name="slug"/><SubmitButton className="btn-primary rounded-md text-xs" pendingLabel="Creating...">Create group</SubmitButton></form></details>
          <details className="rounded-md border border-line bg-white"><summary className="cursor-pointer list-none px-3 py-2 text-xs font-black uppercase text-court">+ Team / entry</summary><form action="/api/admin/tournament-structure" method="post" className="grid gap-3 border-t border-line p-3 sm:w-80"><input type="hidden" name="action" value="create-team"/><input type="hidden" name="divisionId" value={selected.id}/><Field label="Team / entrant name" name="name" required/><Field label="Short name" name="shortName" required/><Select label="Group" name="groupId"><option value="">No group</option>{selected.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select><Field label="Group position" name="groupPosition" type="number" min={1} max={99}/><SubmitButton className="btn-primary rounded-md text-xs" pendingLabel="Creating...">Create entry</SubmitButton></form></details>
        </div>}>Create teams, assign groups, and edit names.</SectionHeader>

        {selected.groups.length > 0 && <div className="mb-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {selected.groups.map((group) => {
            const standings = computeStandings(group.teams, groupMatchups.filter((matchup) => matchup.groupLabel === group.name), group.standingOverrides);
            const tieSets = unresolvedTieSets(standings);
            const hasOverride = standings.some((row) => row.tiebreakApplied);
            return <article key={group.id} className="rounded-lg border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-black uppercase text-ink">{group.name}</h3><div className="mt-0.5 text-xs text-gray-500">{group.teams.length} team{group.teams.length === 1 ? "" : "s"}</div></div><StatusBadge>{groupCode(group)}</StatusBadge></div>
              <div className="mt-3 flex flex-wrap gap-1.5">{group.teams.length ? group.teams.map((team) => <span key={team.id} className="rounded-md border border-line bg-white px-2 py-1 text-xs font-bold">{team.shortName}</span>) : <span className="text-xs text-gray-500">No teams assigned.</span>}</div>
              {(tieSets.length > 0 || hasOverride) && <details className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3"><summary className="cursor-pointer text-xs font-black uppercase text-amber-950">Standing tiebreak {tieSets.length ? "needed" : "applied"}</summary><div className="mt-3">{tieSets.map((tiedRows) => <form key={tiedRows.map((row) => row.team.id).join("-")} action="/api/admin/tournament-structure" method="post" className="grid gap-2"><input type="hidden" name="action" value="save-group-tiebreak"/><input type="hidden" name="groupId" value={group.id}/>{tiedRows.map((row) => <input key={row.team.id} type="hidden" name="tiedTeamIds" value={row.team.id}/>)}{tiedRows.map((_, index) => <Select key={index} label={`Rank ${tiedRows[0]!.rank + index}`} name={`rank-${index + 1}`}><option value="">Select team</option>{tiedRows.map((row) => <option key={row.team.id} value={row.team.id}>{row.team.shortName} - {row.team.name}</option>)}</Select>)}<SubmitButton className="btn-primary rounded-md text-xs" pendingLabel="Saving...">Save order</SubmitButton></form>)}{hasOverride && <form action="/api/admin/tournament-structure" method="post" className="mt-2"><input type="hidden" name="action" value="clear-group-tiebreak"/><input type="hidden" name="groupId" value={group.id}/><SubmitButton className="btn-ghost rounded-md px-3 py-2 text-xs text-red-700" pendingLabel="Clearing...">Clear tiebreak</SubmitButton></form>}</div></details>}
              <details className="mt-3 rounded-md border border-line bg-white p-3"><summary className="cursor-pointer text-xs font-black uppercase text-gray-600">Group actions</summary><div className="mt-3 grid gap-2"><form action="/api/admin/tournament-structure" method="post" className="grid gap-2"><input type="hidden" name="action" value="update-group"/><input type="hidden" name="groupId" value={group.id}/><Field label="Group name" name="name" defaultValue={group.name} required/><Field label="Slug" name="slug" defaultValue={group.slug} required/><SubmitButton className="btn-ghost rounded-md text-xs" pendingLabel="Saving...">Save group</SubmitButton></form><div className="flex flex-wrap gap-2"><form action="/api/admin/tournament-structure" method="post"><input type="hidden" name="action" value="generate-round-robin"/><input type="hidden" name="divisionId" value={selected.id}/><input type="hidden" name="groupId" value={group.id}/><SubmitButton className="btn-ghost rounded-md px-3 py-2 text-xs" pendingLabel="Generating...">Generate matchups</SubmitButton></form><form action="/api/admin/tournament-structure" method="post"><input type="hidden" name="action" value="delete-group"/><input type="hidden" name="groupId" value={group.id}/><SubmitButton className="btn-ghost rounded-md px-3 py-2 text-xs text-red-700" pendingLabel="Removing...">Remove unplayed group</SubmitButton></form></div></div></details>
            </article>;
          })}
        </div>}

        <div className="grid gap-3 xl:grid-cols-2">
          {selected.teams.map((team) => {
            const teamHasRecordedPlay = selected.matchups.some((matchup) => (matchup.homeTeamId === team.id || matchup.awayTeamId === team.id) && matchupLocked(matchup));
            return <article key={team.id} className="rounded-lg border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black uppercase text-ink">{team.name}</h3><StatusBadge>{slotLabel(team)}</StatusBadge>{teamHasRecordedPlay && <StatusBadge tone="locked">History protected</StatusBadge>}</div><div className="mt-1 text-xs text-gray-500">{team.shortName} · {team.group?.name ?? "No group"} · {team._count.players} rostered</div></div>
                <Link href="/admin/players" className="text-xs font-black text-court hover:underline">Manage roster</Link>
              </div>
              <div className="mt-3 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">{team.players.length ? team.players.map((player) => <span key={player.id} className={`rounded-md border px-2 py-1 text-[11px] font-bold ${player.participationStatus === "CONFIRMED" ? "border-court/30 bg-court/5 text-court" : "border-line bg-paper text-gray-500"}`}>{formatPlayerDisplayName(player)}</span>) : <span className="text-xs text-gray-500">No players assigned.</span>}</div>
              <form action="/api/admin/tournament-structure" method="post" className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end"><input type="hidden" name="action" value="update-team-identity"/><input type="hidden" name="teamId" value={team.id}/><Field label="Team name" name="name" defaultValue={team.name} required/><Field label="Short name" name="shortName" defaultValue={team.shortName} required/><SubmitButton className="btn-primary min-h-11 rounded-md px-3 text-xs" pendingLabel="Saving...">Save name</SubmitButton></form>
              <details className="mt-3 rounded-md border border-line bg-paper p-3"><summary className="cursor-pointer text-xs font-black uppercase text-gray-600">Placement & team actions</summary><div className="mt-3 grid gap-3"><form action="/api/admin/tournament-structure" method="post" className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end"><input type="hidden" name="action" value="update-team-structure"/><input type="hidden" name="teamId" value={team.id}/><input type="hidden" name="divisionId" value={selected.id}/><Select label="Group" name="groupId" defaultValue={team.groupId}><option value="">No group</option>{selected.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select><Field label="Position" name="groupPosition" type="number" min={1} max={99} defaultValue={team.groupPosition}/><SubmitButton className="btn-ghost min-h-11 rounded-md text-xs" pendingLabel="Moving...">Save placement</SubmitButton></form><form action="/api/admin/tournament-structure" method="post"><input type="hidden" name="action" value="delete-team"/><input type="hidden" name="teamId" value={team.id}/><SubmitButton className="btn-ghost rounded-md px-3 py-2 text-xs text-red-700" pendingLabel="Removing...">Remove unplayed team</SubmitButton></form></div></details>
            </article>;
          })}
        </div>
        {!selected.teams.length && <EmptyState text="No teams or entries yet. Create one above or assign confirmed players from the Player Pool." action={<Link href="/admin/players" className="btn-primary inline-flex rounded-md">Open Player Pool</Link>} />}
      </section>

      <section id="lineup-rules" className="scroll-mt-40 rounded-xl border border-line bg-white p-5 shadow-panel">
        <SectionHeader eyebrow="Team manager rules" title="Lineup categories">Set the allowed pair type for each match slot.</SectionHeader>
        <form action="/api/admin/tournament-structure" method="post" className="space-y-4">
          <input type="hidden" name="action" value="update-lineup-rules"/>
          <input type="hidden" name="divisionId" value={selected.id}/>
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-lg border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="label text-court">Group / round robin</div><h3 className="font-black uppercase text-ink">{selected.defaultGamesPerMatchup} match slots</h3></div><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="groupCategoryRulesEnabled" defaultChecked={selected.groupCategoryRulesEnabled}/> Enforce</label></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: selected.defaultGamesPerMatchup }, (_, index) => <Select key={`group-${index + 1}`} label={`Match ${index + 1}`} name={`groupCategory-${index + 1}`} defaultValue={selected.groupMatchCategories[index] ?? defaultCategoryPattern(selected.defaultGamesPerMatchup, "GROUP")[index]}><option value="MENS">Men's</option><option value="WOMENS">Women's</option><option value="MIXED">Mixed</option></Select>)}</div>
            </section>
            <section className="rounded-lg border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="label text-court">Playoffs</div><h3 className="font-black uppercase text-ink">{selected.knockoutGamesPerMatchup ?? selected.defaultGamesPerMatchup} match slots</h3></div><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="knockoutCategoryRulesEnabled" defaultChecked={selected.knockoutCategoryRulesEnabled}/> Enforce</label></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: selected.knockoutGamesPerMatchup ?? selected.defaultGamesPerMatchup }, (_, index) => <Select key={`knockout-${index + 1}`} label={`Match ${index + 1}`} name={`knockoutCategory-${index + 1}`} defaultValue={selected.knockoutMatchCategories[index] ?? defaultCategoryPattern(selected.knockoutGamesPerMatchup ?? selected.defaultGamesPerMatchup, "KNOCKOUT")[index]}><option value="MENS">Men's</option><option value="WOMENS">Women's</option><option value="MIXED">Mixed</option></Select>)}</div>
            </section>
          </div>
          <SubmitButton className="btn-primary rounded-md" pendingLabel="Saving...">Save lineup rules</SubmitButton>
        </form>
      </section>

      <section id="schedule" className="scroll-mt-40 rounded-xl border border-line bg-white p-5 shadow-panel">
        <SectionHeader eyebrow="Tournament day" title="Courts & queue">Stack team matchups by court and call order.</SectionHeader>
        <TournamentCourtBoard initialActiveCourtCount={tournament.activeCourtCount} initialQueuedMatchups={queuedMatchups.map(queueDto)} initialAvailableMatchups={availableQueueMatchups.map(queueDto)}/>
      </section>

      <section id="matchups" className="scroll-mt-40 rounded-xl border border-line bg-white p-5 shadow-panel">
        <SectionHeader eyebrow="Future structure" title="Matchups" action={<details className="rounded-md border border-line bg-white"><summary className="cursor-pointer list-none px-3 py-2 text-xs font-black uppercase text-court">+ Matchup</summary><form action="/api/admin/tournament-structure" method="post" className="grid gap-3 border-t border-line p-3 sm:w-96"><input type="hidden" name="action" value="create-matchup"/><input type="hidden" name="divisionId" value={selected.id}/><Select label="Stage" name="stage" defaultValue="CUSTOM">{stages.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select><Field label="Scope / group label" name="groupLabel"/><Field label="Round label" name="roundLabel" defaultValue="Custom match" required/><Field label="Matches" name="gamesPerMatchup" type="number" min={1} max={31}/><SubmitButton className="btn-primary rounded-md text-xs" pendingLabel="Creating...">Create future matchup</SubmitButton></form></details>}>Create or edit future team matchups.</SectionHeader>
        {selected.formatType === "GROUP_KNOCKOUT" && selected.autoProgression && expectedQualifierCount === 8 && <section className="mb-5 rounded-xl border border-court/25 bg-court/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="label text-court">Quarterfinal bracket map</div><h3 className="mt-1 text-lg font-black uppercase">Choose who enters each QF slot</h3><p className="mt-1 max-w-3xl text-sm text-gray-600">Map standings positions to the eight Quarterfinal boxes. Actual teams are filled automatically once group standings are resolved; Semifinal and Final progression continues from QF winners.</p></div><StatusBadge tone={qfConfigurationLocked ? "locked" : "ready"}>{qfConfigurationLocked ? "Locked by recorded play" : "Configurable"}</StatusBadge></div>
          {qfConfigurationLocked ? <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">Quarterfinal seed mapping is protected because QF play has already started.</div> : <QuarterfinalSeedMapper
            divisionId={selected.id}
            options={qfSourceOptions}
            initial={Array.from({ length: 4 }, (_, index) => ({
              home: quarterfinals[index]?.homeQualificationSource ?? "",
              away: quarterfinals[index]?.awayQualificationSource ?? "",
            }))}
          />}
        </section>}
        {selected.formatType === "GROUP_KNOCKOUT" && (!selected.autoProgression || expectedQualifierCount !== 8) && <div className="mb-5 rounded-lg border border-line bg-paper p-3 text-xs text-gray-600">Quarterfinal seed mapping appears when Auto progression is enabled and the division is configured for exactly 8 qualifiers. Current configured total: <strong>{expectedQualifierCount}</strong>.</div>}
        <div className="grid gap-3 2xl:grid-cols-2">
          {selected.matchups.map((matchup) => {
            const locked = matchupLocked(matchup);
            const isKnockout = matchup.stage === "QUARTERFINAL" || matchup.stage === "SEMIFINAL" || matchup.stage === "FINAL" || matchup.stage === "THIRD_PLACE";
            const configuredCategories = isKnockout ? selected.knockoutMatchCategories : selected.groupMatchCategories;
            const categoryRulesEnabled = isKnockout ? selected.knockoutCategoryRulesEnabled : selected.groupCategoryRulesEnabled;
            return <article key={matchup.id} className={`rounded-lg border p-4 ${locked ? "border-amber-300 bg-amber-50" : "border-line bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-ink">{matchup.homeTeam?.shortName || "TBD"} vs {matchup.awayTeam?.shortName || "TBD"}</h3><StatusBadge tone={locked ? "locked" : matchup.status === "READY" ? "ready" : "warn"}>{locked ? "Protected" : displayStatus(matchup.status)}</StatusBadge>{matchup.queuePosition !== null && <StatusBadge tone="ready">Queue #{matchup.queuePosition} · Court {matchup.courtLabel}</StatusBadge>}</div><div className="mt-1 text-xs text-gray-500">{matchupContextLabel(matchup)} · {matchup.gamesPerMatchup} match{matchup.gamesPerMatchup === 1 ? "" : "es"}</div><div className="mt-2 flex flex-wrap gap-1">{Array.from({ length: matchup.gamesPerMatchup }, (_, index) => <span key={index} className="rounded-md border border-line bg-paper px-2 py-1 text-[10px] font-bold">M{index + 1}: {categoryLabel(categoryRulesEnabled ? configuredCategories[index] ?? null : null)}</span>)}</div></div>
                {matchup.games.length === matchup.gamesPerMatchup && matchup.games.length > 0 && <Link href={`/admin/matches/${matchup.id}/scorecards`} className="btn-ghost rounded-md px-3 py-2 text-xs">Print scorecards</Link>}
              </div>
              <details className="mt-3 rounded-md border border-line bg-white p-3" open={!locked && (!matchup.homeTeamId || !matchup.awayTeamId)}><summary className="cursor-pointer text-xs font-black uppercase text-gray-600">Edit matchup</summary><form action="/api/admin/tournament-structure" method="post" className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input type="hidden" name="action" value="update-matchup"/><input type="hidden" name="matchupId" value={matchup.id}/><input type="hidden" name="divisionId" value={selected.id}/><Select label="Stage" name="stage" defaultValue={matchup.stage}>{stages.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select><Field label="Scope / group label" name="groupLabel" defaultValue={matchup.groupLabel}/><Select label="Home team" name="homeTeamId" defaultValue={matchup.homeTeamId}><option value="">TBD</option>{selected.teams.map((team) => <option key={team.id} value={team.id}>{team.shortName} - {team.name}</option>)}</Select><Select label="Away team" name="awayTeamId" defaultValue={matchup.awayTeamId}><option value="">TBD</option>{selected.teams.map((team) => <option key={team.id} value={team.id}>{team.shortName} - {team.name}</option>)}</Select><Field label="Matches" name="gamesPerMatchup" type="number" min={1} max={31} defaultValue={matchup.gamesPerMatchup}/><Field label="Round label" name="roundLabel" defaultValue={matchup.roundLabel} required/><div className="md:col-span-2 xl:col-span-4"><SubmitButton className="btn-primary rounded-md px-3 py-2 text-xs" pendingLabel="Saving...">Save matchup</SubmitButton></div></form>{!locked && <form action="/api/admin/tournament-structure" method="post" className="mt-2"><input type="hidden" name="action" value="delete-matchup"/><input type="hidden" name="matchupId" value={matchup.id}/><SubmitButton className="btn-ghost rounded-md px-3 py-2 text-xs text-red-700" pendingLabel="Deleting...">Delete future matchup</SubmitButton></form>}</details>
            </article>;
          })}
        </div>
        {!selected.matchups.length && <EmptyState text="No matchups configured yet. Create future matchups once teams are known."/>}
      </section>

    </TournamentSetupTabs>

      <details className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5">
        <summary className="cursor-pointer text-sm font-black uppercase text-red-800">Danger zone · delete division</summary>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_360px] lg:items-end"><div className="text-sm leading-6 text-red-950">Deletion is blocked once recorded play exists. Type <strong>{selected.name}</strong> to confirm.</div><form action="/api/admin/tournament-structure" method="post" className="grid gap-2"><input type="hidden" name="action" value="delete-division"/><input type="hidden" name="divisionId" value={selected.id}/><Field label="Confirmation" name="confirmDivisionName" required/><SubmitButton className="btn-ghost rounded-md border-red-300 bg-white text-xs text-red-800" pendingLabel="Deleting...">Delete division</SubmitButton></form></div>
      </details>
  </main>;
}
