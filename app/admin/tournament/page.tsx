import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import SubmitButton from "@/components/SubmitButton";
import { formatPlayerDisplayName } from "@/lib/player-name";
import { computeStandings, type StandingRow } from "@/lib/tournament/standings";
import { displayStatus } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const formats = ["GROUP_KNOCKOUT", "ROUND_ROBIN", "SINGLE_ELIMINATION", "CUSTOM"] as const;
const stages = ["GROUP", "ROUND_ROBIN", "QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE", "CUSTOM"] as const;
const entrantTypes = ["TEAM", "PLAYER", "PAIR"] as const;

const formatCopy: Record<(typeof formats)[number], string> = {
  GROUP_KNOCKOUT: "Group standings feed a supported knockout bracket when progression is enabled.",
  ROUND_ROBIN: "Every configured team can play the others. Advancement is organizer-controlled unless matchups are created later.",
  SINGLE_ELIMINATION: "Use future matchups to build the bracket and keep winners moving manually as needed.",
  CUSTOM: "Organizer-controlled structure for Executive or last-minute formats.",
};

const entrantCopy: Record<(typeof entrantTypes)[number], string> = {
  TEAM: "Team Event",
  PLAYER: "Individual player",
  PAIR: "Pair event",
};

function Field({ label, name, defaultValue, type = "text", min, max, required = false, help }: { label: string; name: string; defaultValue?: string | number | null; type?: string; min?: number; max?: number; required?: boolean; help?: string }) {
  return <label className="block"><span className="label">{label}</span><input name={name} type={type} min={min} max={max} defaultValue={defaultValue ?? ""} required={required} className="mt-1 w-full border border-line bg-white p-3 text-sm font-bold"/>{help && <span className="mt-1 block text-xs text-gray-500">{help}</span>}</label>;
}

function Select({ label, name, defaultValue, children, help }: { label: string; name: string; defaultValue?: string | null; children: React.ReactNode; help?: string }) {
  return <label className="block"><span className="label">{label}</span><select name={name} defaultValue={defaultValue ?? ""} className="mt-1 w-full border border-line bg-white p-3 text-sm font-bold">{children}</select>{help && <span className="mt-1 block text-xs text-gray-500">{help}</span>}</label>;
}

function Stat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "court" | "gold" | "warn" }) {
  const styles = tone === "court" ? "border-court/30 bg-court/10 text-court" : tone === "gold" ? "border-gold bg-gold/20 text-ink" : tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-line bg-white text-ink";
  return <div className={`border px-4 py-3 ${styles}`}><div className="text-2xl font-black">{value}</div><div className="label">{label}</div></div>;
}

function SectionHeader({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><div className="label text-court">{eyebrow}</div><h2 className="text-xl font-black uppercase text-ink">{title}</h2>{children && <p className="mt-1 max-w-3xl text-sm text-gray-600">{children}</p>}</div>{action}</div>;
}

function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return <div className="border border-dashed border-line bg-white p-5 text-sm text-gray-500">{text}{action && <div className="mt-3">{action}</div>}</div>;
}

function StatusBadge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "ready" | "warn" | "locked" }) {
  const styles = tone === "ready" ? "border-court bg-court/10 text-court" : tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-950" : tone === "locked" ? "border-gray-300 bg-gray-100 text-gray-700" : "border-line bg-white text-gray-600";
  return <span className={`inline-flex border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${styles}`}>{children}</span>;
}

function manilaDateTimeValue(value: Date | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  return parts.replace(" ", "T");
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

export default async function TournamentSetup({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; division?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");
  const query = await searchParams;
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!tournament) return <main className="admin-shell">No tournament.</main>;

  const divisions = await prisma.division.findMany({
    where: { tournamentId: tournament.id },
    select: { id: true, name: true, slug: true, sortOrder: true, formatType: true, entrantType: true, isPublic: true, _count: { select: { teams: true, matchups: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const selectedId = divisions.some((division) => division.id === query.division) ? String(query.division) : divisions[0]?.id;
  if (!selectedId) return <main className="admin-shell"><AdminNav/><EmptyState text="No divisions are configured yet. Add a division to begin setup."/></main>;

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

  const confirmedEntries = selected.playerEntries.filter((entry) => entry.status === "CONFIRMED" && entry.player.isActive && entry.player.participationStatus === "CONFIRMED");
  const assignedConfirmed = confirmedEntries.filter((entry) => entry.player.teamId && selected.teams.some((team) => team.id === entry.player.teamId)).length;
  const unassignedConfirmed = confirmedEntries.length - assignedConfirmed;
  const lockedMatchups = selected.matchups.filter(matchupLocked).length;
  const unscheduledFuture = selected.matchups.filter((matchup) => !matchupLocked(matchup) && !matchup.courtLabel).length;
  const groupMatchups = selected.matchups.filter((matchup) => matchup.stage === "GROUP");
  const lockedGroupMatchups = groupMatchups.filter(matchupLocked).length;
  const unplayedGroupMatchups = groupMatchups.length - lockedGroupMatchups;
  const groupRequired = selected.formatType === "GROUP_KNOCKOUT";
  const sortedTeams = [...selected.teams].sort((first, second) => {
    const firstGroup = first.group?.name ?? "ZZZ";
    const secondGroup = second.group?.name ?? "ZZZ";
    if (firstGroup !== secondGroup) return firstGroup.localeCompare(secondGroup);
    return (first.groupPosition ?? 999) - (second.groupPosition ?? 999) || first.shortName.localeCompare(second.shortName);
  });
  const ungroupedTeams = sortedTeams.filter((team) => !team.groupId);
  const readiness = [
    { tone: selected.teams.length ? "ready" : "warn", text: selected.teams.length ? `${selected.teams.length} teams/pair units configured` : "No teams or pair units yet" },
    { tone: !groupRequired || selected.groups.length ? "ready" : "warn", text: groupRequired ? `${selected.groups.length} groups configured` : "Groups optional for this format" },
    { tone: selected.matchups.length ? "ready" : "warn", text: selected.matchups.length ? `${selected.matchups.length} matchups configured` : "No matchups scheduled yet" },
    { tone: unassignedConfirmed ? "warn" : "ready", text: unassignedConfirmed ? `${unassignedConfirmed} confirmed players unassigned` : "No confirmed unassigned players in this division" },
    { tone: unscheduledFuture ? "warn" : "ready", text: unscheduledFuture ? `${unscheduledFuture} future matchups have no court` : "Future matchups have court labels or are TBD by design" },
    { tone: lockedMatchups ? "locked" : "ready", text: lockedMatchups ? `${lockedMatchups} matchups protected by recorded play` : "No recorded play locks in this division yet" },
  ] as const;

  return <main className="admin-shell">
    <AdminNav />
    <FlashMessage success={query.success} error={query.error} />
    <div className="label text-court">Tournament operations console</div>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-4xl font-black uppercase text-ink">Tournament Setup</h1><p className="mt-2 max-w-4xl text-sm text-gray-600">Manage divisions, groups, teams, pair units, matchups, courts, and format settings. Started games remain protected; future structure stays editable for last-minute organizer decisions.</p></div>
      <details className="border border-line bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-black uppercase text-court">Add Division</summary>
        <form action="/api/admin/tournament-structure" method="post" className="grid w-full gap-3 border-t border-line p-4 sm:w-[420px]">
          <input type="hidden" name="action" value="create-division" />
          <Field label="Division name" name="name" required help="Example: Executive Men or Open Division." />
          <Select label="Format" name="formatType" defaultValue="CUSTOM">{formats.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select>
          <Select label="Entrant type" name="entrantType" defaultValue="TEAM">{entrantTypes.map((item) => <option key={item} value={item}>{entrantCopy[item]}</option>)}</Select>
          <Field label="Group / default games per matchup" name="defaultGamesPerMatchup" type="number" min={1} max={31} defaultValue={1} required />
          <Field label="Knockout games per matchup" name="knockoutGamesPerMatchup" type="number" min={1} max={31} defaultValue={1} help="Used for quarterfinals, semifinals, Battle for 3rd, and the Grand Final." />
          <details className="border border-line bg-paper p-3">
            <summary className="cursor-pointer text-xs font-black uppercase">Advanced fields</summary>
            <div className="mt-3 grid gap-3">
              <Field label="Slug" name="slug" help="Leave blank if the generated URL name is acceptable." />
              <Field label="Sort order" name="sortOrder" type="number" min={0} max={999} defaultValue={(divisions.at(-1)?.sortOrder ?? 0) + 10} required />
              <Field label="Qualifiers per group" name="qualifiersPerGroup" type="number" min={0} max={16} defaultValue={0} required />
              <Field label="Wildcard slots" name="wildcardCount" type="number" min={0} max={16} defaultValue={0} required />
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="autoProgression" /> Enable supported auto progression</label>
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="thirdPlaceEnabled" /> Include Battle for 3rd</label>
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="suddenDeathAtTen" /> Sudden death at 10-10</label>
            </div>
          </details>
          <SubmitButton pendingLabel="Creating...">Create division</SubmitButton>
        </form>
      </details>
    </div>

    <section className="mt-6 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="border border-line bg-white p-3">
          <div className="label">Divisions</div>
          <div className="mt-3 flex gap-2 overflow-x-auto xl:block xl:space-y-2">
            {divisions.map((division) => <Link key={division.id} href={`/admin/tournament?division=${division.id}`} className={`block min-w-48 border px-3 py-3 text-left xl:min-w-0 ${division.id === selected.id ? "border-court bg-court/10 text-court" : "border-line bg-white hover:border-court"}`}>
              <div className="font-black uppercase">{division.name}</div>
              <div className="mt-1 text-xs text-gray-500">{division._count.teams} teams - {division._count.matchups} matchups</div>
            </Link>)}
          </div>
        </section>
        <section className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-black uppercase">History protection</div>
          <p className="mt-2">If a matchup already has recorded play, structural edits are locked to preserve results. Use metadata edits, corrections, undo, or checkpoints instead.</p>
        </section>
      </aside>

      <div className="space-y-6">
        <section className="border border-line bg-white">
          <div className="border-l-4 border-court bg-gradient-to-r from-court/10 to-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><div className="label text-court">Current division</div><h2 className="text-3xl font-black uppercase text-ink">{selected.name}</h2><p className="mt-1 text-sm text-gray-600">{formatCopy[selected.formatType]}</p></div>
              <div className="flex flex-wrap gap-2"><StatusBadge>{entrantCopy[selected.entrantType]}</StatusBadge><StatusBadge tone={selected.isPublic ? "ready" : "warn"}>{selected.isPublic ? "Public" : "Private"}</StatusBadge></div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <Stat label="Teams / pair units" value={selected.teams.length} tone="court" />
              <Stat label="Groups" value={selected.groups.length} />
              <Stat label="Matchups" value={selected.matchups.length} tone="gold" />
              <Stat label="Group games" value={selected.defaultGamesPerMatchup} />
              <Stat label="Knockout games" value={selected.knockoutGamesPerMatchup ?? selected.defaultGamesPerMatchup} />
              <Stat label="Confirmed players" value={confirmedEntries.length} tone={unassignedConfirmed ? "warn" : "default"} />
            </div>
          </div>
          <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
            {readiness.map((item) => <div key={item.text} className="bg-white p-4"><StatusBadge tone={item.tone}>{item.tone === "warn" ? "Check" : item.tone === "locked" ? "Protected" : "Ready"}</StatusBadge><div className="mt-2 text-sm font-bold text-ink">{item.text}</div></div>)}
          </div>
        </section>

        <nav aria-label="Jump to tournament configuration" className="flex flex-wrap gap-2 border border-line bg-paper p-3 text-xs font-black">
          <span className="mr-1 self-center text-gray-500">Jump to:</span>
          <a href="#division-settings" className="btn-ghost px-3 py-2 text-xs">Settings</a>
          <a href="#groups" className="btn-ghost px-3 py-2 text-xs">Groups</a>
          <a href="#placement" className="btn-ghost px-3 py-2 text-xs">Placement</a>
          <a href="#teams" className="btn-ghost px-3 py-2 text-xs">Teams / entries</a>
          <a href="#schedule" className="btn-ghost px-3 py-2 text-xs">Schedule</a>
          <Link href="/admin/players" className="btn-primary px-3 py-2 text-xs">Player Pool</Link>
        </nav>

        <section className="border border-court/30 bg-court/5 p-4">
          <SectionHeader eyebrow="Bulk setup" title="Fast Tournament Configuration">Use these after teams and groups are known. Recorded match results are protected.</SectionHeader>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <form action="/api/admin/tournament-structure" method="post" className="border border-line bg-white p-4">
              <input type="hidden" name="action" value="generate-all-group-round-robins" />
              <input type="hidden" name="divisionId" value={selected.id} />
              <div className="font-black uppercase">Generate group matchups</div>
              <p className="mt-2 min-h-12 text-sm text-gray-600">Creates every team-vs-team matchup inside each group. Existing unplayed group matchups are replaced.</p>
              <SubmitButton className="btn-primary mt-4 w-full text-xs" pendingLabel="Generating...">Generate all groups</SubmitButton>
            </form>
            <form action="/api/admin/tournament-structure" method="post" className="border border-line bg-white p-4">
              <input type="hidden" name="action" value="clear-unplayed-group-matchups" />
              <input type="hidden" name="divisionId" value={selected.id} />
              <div className="font-black uppercase">Clear group matchups</div>
              <p className="mt-2 min-h-12 text-sm text-gray-600">Deletes only unplayed group-stage matchups so you can regenerate after slot changes.</p>
              <SubmitButton className="btn-ghost mt-4 w-full text-xs text-red-700" pendingLabel="Clearing...">Clear unplayed group matchups</SubmitButton>
            </form>
            <form action="/api/admin/tournament-structure" method="post" className="border border-line bg-white p-4">
              <input type="hidden" name="action" value="auto-number-group-slots" />
              <input type="hidden" name="divisionId" value={selected.id} />
              <div className="font-black uppercase">Renumber slots</div>
              <p className="mt-2 min-h-12 text-sm text-gray-600">Compacts each group to positions 1, 2, 3, and so on using the current team order.</p>
              <SubmitButton className="btn-ghost mt-4 w-full text-xs" pendingLabel="Numbering...">Auto-number slots</SubmitButton>
            </form>
            <form action="/api/admin/tournament-structure" method="post" className="border border-line bg-white p-4">
              <input type="hidden" name="action" value="auto-distribute-ungrouped-teams" />
              <input type="hidden" name="divisionId" value={selected.id} />
              <div className="font-black uppercase">Distribute ungrouped teams</div>
              <p className="mt-2 min-h-12 text-sm text-gray-600">Assigns ungrouped teams evenly across the existing groups, then fills the next open slot.</p>
              <SubmitButton className="btn-ghost mt-4 w-full text-xs" pendingLabel="Distributing...">Distribute ungrouped</SubmitButton>
            </form>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-gray-600">
            <span className="border border-line bg-white px-2 py-1">{selected.groups.length} groups</span>
            <span className="border border-line bg-white px-2 py-1">{ungroupedTeams.length} ungrouped teams</span>
            <span className="border border-line bg-white px-2 py-1">{groupMatchups.length} group matchups</span>
            {lockedGroupMatchups > 0 && <span className="border border-amber-300 bg-amber-50 px-2 py-1 text-amber-950">{lockedGroupMatchups} protected group matchups</span>}
            {unplayedGroupMatchups > 0 && <span className="border border-court/30 bg-white px-2 py-1 text-court">{unplayedGroupMatchups} unplayed group matchups</span>}
          </div>
        </section>

        <section id="division-settings" className="scroll-mt-36 border border-line bg-white p-5">
          <SectionHeader eyebrow="Division settings" title="Format and visibility">Common tournament-day settings are first. URL slug, sort order, and long guide text are under Advanced.</SectionHeader>
          <form action="/api/admin/tournament-structure" method="post" className="space-y-5">
            <input type="hidden" name="action" value="update-division" />
            <input type="hidden" name="divisionId" value={selected.id} />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Division name" name="name" defaultValue={selected.name} required />
              <Select label="Tournament format" name="formatType" defaultValue={selected.formatType} help={formatCopy[selected.formatType]}>{formats.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select>
              <Select label="Entrant type" name="entrantType" defaultValue={selected.entrantType}>{entrantTypes.map((item) => <option key={item} value={item}>{entrantCopy[item]}</option>)}</Select>
              <Field label="Group / default games" name="defaultGamesPerMatchup" type="number" min={1} max={31} defaultValue={selected.defaultGamesPerMatchup} required help="Used for group/round-robin matchups and as the fallback for custom stages." />
              <Field label="Knockout games" name="knockoutGamesPerMatchup" type="number" min={1} max={31} defaultValue={selected.knockoutGamesPerMatchup ?? selected.defaultGamesPerMatchup} required help="Used by quarterfinals, semifinals, Battle for 3rd, and the Grand Final. For the Team Event, set this to 5 while group play remains 7." />
              <div className="space-y-2">
                <label className="flex min-h-12 items-center gap-3 border border-line bg-paper px-3 text-sm font-bold"><input type="checkbox" name="isPublic" defaultChecked={selected.isPublic} /> Show this division publicly</label>
                <label className="flex min-h-12 items-center gap-3 border border-line bg-paper px-3 text-sm font-bold"><input type="checkbox" name="autoProgression" defaultChecked={selected.autoProgression} /> Auto progression when supported</label>
              </div>
              <div className="space-y-2">
                <label className="flex min-h-12 items-center gap-3 border border-line bg-paper px-3 text-sm font-bold"><input type="checkbox" name="thirdPlaceEnabled" defaultChecked={selected.thirdPlaceEnabled} /> Include Battle for 3rd</label>
                <label className="flex min-h-12 items-center gap-3 border border-line bg-paper px-3 text-sm font-bold"><input type="checkbox" name="suddenDeathAtTen" defaultChecked={selected.suddenDeathAtTen} /> Sudden death at 10-10</label>
              </div>
            </div>
            <div className="border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">Changing the game count of an unplayed matchup clears its submitted lineups/generated games so team managers can submit the correct number of playing pairs. Matchups with recorded play remain protected.</div>
            {selected.formatType === "GROUP_KNOCKOUT" && <div className="grid gap-4 border border-court/20 bg-court/5 p-4 md:grid-cols-2">
              <Field label="Teams advancing from each group" name="qualifiersPerGroup" type="number" min={0} max={16} defaultValue={selected.qualifiersPerGroup} required help="Teams that automatically advance from each group." />
              <Field label="Wildcard slots" name="wildcardCount" type="number" min={0} max={16} defaultValue={selected.wildcardCount} required help="Additional best-performing teams that advance regardless of group." />
            </div>}
            {selected.formatType !== "GROUP_KNOCKOUT" && <input type="hidden" name="qualifiersPerGroup" value={selected.qualifiersPerGroup} />}
            {selected.formatType !== "GROUP_KNOCKOUT" && <input type="hidden" name="wildcardCount" value={selected.wildcardCount} />}
            <details className="border border-line bg-paper p-4">
              <summary className="cursor-pointer text-sm font-black uppercase">Advanced settings</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="URL slug" name="slug" defaultValue={selected.slug} required help="Used in URLs. Usually generated from the division name." />
                <Field label="Display order" name="sortOrder" type="number" min={0} max={999} defaultValue={selected.sortOrder} required help="Lower numbers appear first." />
                <label className="block md:col-span-2"><span className="label">Advancement rule</span><textarea name="advancementRule" defaultValue={selected.advancementRule ?? ""} className="mt-1 min-h-20 w-full border border-line bg-white p-3 text-sm"/><span className="mt-1 block text-xs text-gray-500">Short explanation shown in the public format guide.</span></label>
                <label className="block md:col-span-2"><span className="label">Guide notes</span><textarea name="guideNotes" defaultValue={selected.guideNotes ?? ""} className="mt-1 min-h-20 w-full border border-line bg-white p-3 text-sm"/></label>
              </div>
            </details>
            <SubmitButton pendingLabel="Saving division...">Save division settings</SubmitButton>
          </form>
          <details className="mt-5 border border-red-200 bg-red-50 p-4">
            <summary className="cursor-pointer text-sm font-black uppercase text-red-800">Delete outdated division</summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_360px] lg:items-end">
              <div className="text-sm text-red-950">
                <p className="font-bold">Use this only for divisions that should no longer be configured.</p>
                <p className="mt-1">The delete action is blocked once recorded play exists. If it is allowed, teams, groups, future matchups, and division eligibility rows are removed; assigned players are returned to the pool.</p>
                <p className="mt-2 font-bold">Confirmation text: <span className="border border-red-200 bg-white px-2 py-1">{selected.name}</span></p>
                {lockedMatchups > 0 && <p className="mt-2 font-bold">This division currently has protected matchups, so deletion will be blocked.</p>}
              </div>
              <form action="/api/admin/tournament-structure" method="post" className="grid gap-2">
                <input type="hidden" name="action" value="delete-division" />
                <input type="hidden" name="divisionId" value={selected.id} />
                <Field label="Type the confirmation text" name="confirmDivisionName" defaultValue="" required />
                <SubmitButton className="btn-ghost border-red-300 bg-white text-xs text-red-800" pendingLabel="Deleting...">Delete division</SubmitButton>
              </form>
            </div>
          </details>
        </section>

        <section id="groups" className="scroll-mt-36 border border-line bg-white p-5">
          <SectionHeader eyebrow="Groups" title="Group Management" action={<details className="border border-line bg-white"><summary className="cursor-pointer px-3 py-2 text-xs font-black uppercase text-court">Create group</summary><form action="/api/admin/tournament-structure" method="post" className="grid gap-3 border-t border-line p-3 sm:w-80"><input type="hidden" name="action" value="create-group"/><input type="hidden" name="divisionId" value={selected.id}/><Field label="Group name" name="name" required/><Field label="Slug" name="slug" help="Leave blank to generate from name."/><SubmitButton className="btn-primary text-xs" pendingLabel="Creating...">Create group</SubmitButton></form></details>}>Use groups only when this division needs them. Group rename keeps linked group-stage matchups aligned.</SectionHeader>
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {selected.groups.map((group) => {
              const standings = computeStandings(group.teams, groupMatchups.filter((matchup) => matchup.groupLabel === group.name), group.standingOverrides);
              const tieSets = unresolvedTieSets(standings);
              const hasOverride = standings.some((row) => row.tiebreakApplied);
              return <article key={group.id} className="border border-line bg-paper p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black uppercase">{group.name}</h3><div className="text-xs text-gray-500">{group.teams.length} teams/pair units</div></div><StatusBadge>{group.slug}</StatusBadge></div>
                <div className="mt-3 flex flex-wrap gap-2">{group.teams.length ? group.teams.map((team) => <span key={team.id} className="border border-line bg-white px-2 py-1 text-xs font-bold">{team.shortName}</span>) : <span className="text-sm text-gray-500">No teams assigned.</span>}</div>
                {(tieSets.length > 0 || hasOverride) && <div className="mt-3 border border-amber-300 bg-amber-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-black uppercase text-amber-950">Standing tiebreak</div><div className="text-xs text-amber-900">{tieSets.length ? "Set the order for tied teams before auto progression fills knockout slots." : "Organizer tiebreak order is applied."}</div></div><StatusBadge tone={tieSets.length ? "warn" : "ready"}>{tieSets.length ? "Needs order" : "Resolved"}</StatusBadge></div>
                  {tieSets.map((tiedRows) => <form key={tiedRows.map((row) => row.team.id).join("-")} action="/api/admin/tournament-structure" method="post" className="mt-3 grid gap-2">
                    <input type="hidden" name="action" value="save-group-tiebreak" />
                    <input type="hidden" name="groupId" value={group.id} />
                    {tiedRows.map((row) => <input key={row.team.id} type="hidden" name="tiedTeamIds" value={row.team.id} />)}
                    {tiedRows.map((_, index) => <Select key={index} label={`Rank ${tiedRows[0]!.rank + index}`} name={`rank-${index + 1}`}>
                      <option value="">Select team</option>
                      {tiedRows.map((row) => <option key={row.team.id} value={row.team.id}>{row.team.shortName} - {row.team.name}</option>)}
                    </Select>)}
                    <SubmitButton className="btn-primary text-xs" pendingLabel="Saving...">Save tiebreak order</SubmitButton>
                  </form>)}
                  {hasOverride && <form action="/api/admin/tournament-structure" method="post" className="mt-2"><input type="hidden" name="action" value="clear-group-tiebreak" /><input type="hidden" name="groupId" value={group.id} /><SubmitButton className="btn-ghost px-3 py-2 text-xs text-red-700" pendingLabel="Clearing...">Clear tiebreak order</SubmitButton></form>}
                </div>}
                <details className="mt-3 border border-line bg-white p-3"><summary className="cursor-pointer text-xs font-black uppercase">Edit group</summary><form action="/api/admin/tournament-structure" method="post" className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><input type="hidden" name="action" value="update-group"/><input type="hidden" name="groupId" value={group.id}/><Field label="Group name" name="name" defaultValue={group.name} required/><Field label="Slug" name="slug" defaultValue={group.slug} required/><SubmitButton className="btn-ghost px-3 py-3 text-xs" pendingLabel="Saving...">Rename</SubmitButton></form></details>
                <div className="mt-3 flex flex-wrap gap-2"><form action="/api/admin/tournament-structure" method="post"><input type="hidden" name="action" value="generate-round-robin"/><input type="hidden" name="divisionId" value={selected.id}/><input type="hidden" name="groupId" value={group.id}/><SubmitButton className="btn-ghost px-3 py-2 text-xs" pendingLabel="Generating...">Generate group matchups</SubmitButton></form><form action="/api/admin/tournament-structure" method="post"><input type="hidden" name="action" value="delete-group"/><input type="hidden" name="groupId" value={group.id}/><SubmitButton className="btn-ghost px-3 py-2 text-xs text-red-700" pendingLabel="Removing...">Remove unplayed group</SubmitButton></form></div>
              </article>;
            })}
          </div>
          {!selected.groups.length && <EmptyState text="No groups have been created for this division. That is valid for round-robin, Executive pair units, and custom formats." />}
        </section>

        <section id="placement" className="scroll-mt-36 border border-line bg-white p-5">
          <SectionHeader eyebrow="Group placement" title="Team Event Slots">Assign teams to group slots. The team name and members stay the same when the slot changes.</SectionHeader>
          {selected.groups.length > 0 ? <div className="grid gap-4 xl:grid-cols-2">
            {selected.groups.map((group) => {
              const teams = sortedTeams.filter((team) => team.groupId === group.id);
              return <section key={group.id} className="border border-line bg-paper p-4">
                <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-black uppercase">{group.name}</h3><div className="text-xs text-gray-500">{teams.length} assigned</div></div><StatusBadge>{groupCode(group)}</StatusBadge></div>
                <div className="space-y-2">
                  {teams.map((team) => <form key={team.id} action="/api/admin/tournament-structure" method="post" className="grid gap-3 border border-line bg-white p-3 md:grid-cols-2">
                    <input type="hidden" name="action" value="update-team-structure" />
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="divisionId" value={selected.id} />
                    <div><span className="label">Slot</span><div className="mt-1 border border-line bg-paper px-3 py-3 text-sm font-black">{slotLabel(team)}</div></div>
                    <div><span className="label">Team</span><div className="mt-1 truncate border border-line bg-paper px-3 py-3 text-sm font-bold">{team.name}</div></div>
                    <Select label="Group" name="groupId" defaultValue={team.groupId}><option value="">No group</option>{selected.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
                    <Field label="Position" name="groupPosition" type="number" min={1} max={99} defaultValue={team.groupPosition} />
                    <SubmitButton className="btn-ghost px-3 py-3 text-xs md:col-span-2 md:w-fit" pendingLabel="Saving...">Save</SubmitButton>
                  </form>)}
                  {!teams.length && <div className="border border-dashed border-line bg-white p-4 text-sm text-gray-500">No teams in this group.</div>}
                </div>
              </section>;
            })}
          </div> : <EmptyState text="No groups are configured for this division." />}
          {ungroupedTeams.length > 0 && <section className="mt-4 border border-amber-300 bg-amber-50 p-4">
            <div className="mb-3 font-black uppercase text-amber-950">Unassigned teams</div>
            <div className="space-y-2">
              {ungroupedTeams.map((team) => <form key={team.id} action="/api/admin/tournament-structure" method="post" className="grid gap-3 border border-amber-200 bg-white p-3 md:grid-cols-2">
                <input type="hidden" name="action" value="update-team-structure" />
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="divisionId" value={selected.id} />
                <div><span className="label">Team</span><div className="mt-1 truncate border border-line bg-paper px-3 py-3 text-sm font-bold">{team.name}</div></div>
                <Select label="Group" name="groupId" defaultValue=""><option value="">No group</option>{selected.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
                <Field label="Position" name="groupPosition" type="number" min={1} max={99} defaultValue="" />
                <SubmitButton className="btn-ghost px-3 py-3 text-xs md:self-end" pendingLabel="Saving...">Assign</SubmitButton>
              </form>)}
            </div>
          </section>}
        </section>

        <section id="teams" className="scroll-mt-36 border border-line bg-white p-5">
          <SectionHeader eyebrow="Competition entries" title="Teams and Entrants" action={<details className="border border-line bg-white"><summary className="cursor-pointer px-3 py-2 text-xs font-black uppercase text-court">Create entry</summary><form action="/api/admin/tournament-structure" method="post" className="grid gap-3 border-t border-line p-3 sm:w-80"><input type="hidden" name="action" value="create-team"/><input type="hidden" name="divisionId" value={selected.id}/><Select label="Group" name="groupId"><option value="">No group</option>{selected.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select><Field label="Group position" name="groupPosition" type="number" min={1} max={99}/><Field label="Team / entrant name" name="name" required/><Field label="Short name" name="shortName" required/><SubmitButton className="btn-primary text-xs" pendingLabel="Creating...">Create entry</SubmitButton></form></details>}>For the Team Event, this section manages team identity/placement only; playing pairs are chosen per matchup by team managers. Pair-event entrants can still be represented here when needed.</SectionHeader>
          <div className="grid gap-3 2xl:grid-cols-2">
            {selected.teams.map((team) => {
              const teamHasRecordedPlay = selected.matchups.some((matchup) => (matchup.homeTeamId === team.id || matchup.awayTeamId === team.id) && matchupLocked(matchup));
              return <article key={team.id} className="border border-line bg-white p-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                  <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black uppercase">{team.name}</h3><StatusBadge>{slotLabel(team)}</StatusBadge><StatusBadge tone={teamHasRecordedPlay ? "locked" : "ready"}>{teamHasRecordedPlay ? "History protected" : "Editable until played"}</StatusBadge></div><div className="mt-1 text-sm text-gray-500">{team.shortName} - {team.group?.name ?? "No group"} - {team._count.players} rostered player{team._count.players === 1 ? "" : "s"}</div><div className="mt-3 flex flex-wrap gap-2">{team.players.length ? team.players.map((player) => <span key={player.id} className={`border px-2 py-1 text-xs font-bold ${player.participationStatus === "CONFIRMED" ? "border-court/30 bg-court/10 text-court" : "border-line bg-paper text-gray-600"}`}>{formatPlayerDisplayName(player)}</span>) : <span className="text-sm text-gray-500">No players assigned.</span>}</div></div>
                  <div className="space-y-3"><form action="/api/admin/tournament-structure" method="post" className="grid gap-3"><input type="hidden" name="action" value="update-team-structure"/><input type="hidden" name="teamId" value={team.id}/><input type="hidden" name="divisionId" value={selected.id}/><Select label="Group placement" name="groupId" defaultValue={team.groupId}><option value="">No group</option>{selected.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select><Field label="Group position" name="groupPosition" type="number" min={1} max={99} defaultValue={team.groupPosition}/><SubmitButton className="btn-ghost text-xs" pendingLabel="Moving...">Save placement</SubmitButton></form><form action="/api/admin/tournament-structure" method="post"><input type="hidden" name="action" value="delete-team"/><input type="hidden" name="teamId" value={team.id}/><SubmitButton className="btn-ghost w-full text-xs text-red-700" pendingLabel="Removing...">Remove unplayed team</SubmitButton></form></div>
                </div>
              </article>;
            })}
          </div>
          {!selected.teams.length && <EmptyState text="No teams or pair units assigned yet. Confirm players in the Player Pool, then create teams or Executive pair units." action={<Link href="/admin/players" className="btn-primary inline-flex">Open Player Pool</Link>} />}
        </section>

        <section id="schedule" className="scroll-mt-36 border border-line bg-white p-5">
          <SectionHeader eyebrow="Schedule" title="Matchup Configuration" action={<div className="flex flex-wrap gap-2">{selected.teams.length >= 2 && !selected.groups.length && <form action="/api/admin/tournament-structure" method="post"><input type="hidden" name="action" value="generate-round-robin"/><input type="hidden" name="divisionId" value={selected.id}/><SubmitButton className="btn-ghost px-3 py-2 text-xs" pendingLabel="Generating...">Generate round robin</SubmitButton></form>}<details className="border border-line bg-white"><summary className="cursor-pointer px-3 py-2 text-xs font-black uppercase text-court">Add matchup</summary><form action="/api/admin/tournament-structure" method="post" className="grid gap-3 border-t border-line p-3 sm:w-96"><input type="hidden" name="action" value="create-matchup"/><input type="hidden" name="divisionId" value={selected.id}/><Select label="Stage" name="stage" defaultValue="CUSTOM">{stages.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select><Field label="Scope / group label" name="groupLabel"/><Field label="Round label" name="roundLabel" defaultValue="Custom match" required/><Field label="Games (blank = stage default)" name="gamesPerMatchup" type="number" min={1} max={31} help={`Group/default: ${selected.defaultGamesPerMatchup}; knockout: ${selected.knockoutGamesPerMatchup ?? selected.defaultGamesPerMatchup}.`} /><Field label="Court" name="courtLabel"/><Field label="Schedule (Manila)" name="scheduledAt" type="datetime-local"/><SubmitButton className="btn-primary text-xs" pendingLabel="Creating...">Create future matchup</SubmitButton></form></details></div>}>Future matchups are editable. Completed or started matchups clearly show protection.</SectionHeader>
          {selected.matchups.length > 0 && <form action="/api/admin/tournament-structure" method="post" className="mb-4 border border-line bg-paper">
            <input type="hidden" name="action" value="bulk-update-matchup-schedule" />
            <input type="hidden" name="divisionId" value={selected.id} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white p-4">
              <div><div className="label text-court">Bulk schedule editor</div><h3 className="font-black uppercase">Save several matchups at once</h3></div>
              <SubmitButton className="btn-primary px-3 py-2 text-xs" pendingLabel="Saving...">Save all schedule rows</SubmitButton>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-ink text-left text-white"><tr><th className="p-3">Matchup</th><th className="p-3">Scope</th><th className="p-3">Round label</th><th className="w-28 p-3">Games</th><th className="w-32 p-3">Court</th><th className="w-56 p-3">Schedule (Manila)</th><th className="p-3">Status</th></tr></thead>
                <tbody>{selected.matchups.map((matchup) => {
                  const locked = matchupLocked(matchup);
                  return <tr key={matchup.id} className="border-b border-line bg-white align-top">
                    <td className="p-3 font-black"><input type="hidden" name="matchupIds" value={matchup.id} />{matchup.homeTeam?.shortName || "TBD"} vs {matchup.awayTeam?.shortName || "TBD"}<div className="mt-1 text-xs font-normal text-gray-500">{matchup.homeTeam?.name || "Home TBD"} / {matchup.awayTeam?.name || "Away TBD"}</div></td>
                    <td className="p-3 text-xs font-bold text-gray-600">{matchup.stage.replaceAll("_", " ")}<div className="mt-1">{matchup.groupLabel || "No scope"}</div></td>
                    <td className="p-3"><input name={`roundLabel-${matchup.id}`} defaultValue={matchup.roundLabel} required className="w-full border border-line bg-white p-2 text-sm font-bold" /></td>
                    <td className="p-3"><input name={`gamesPerMatchup-${matchup.id}`} type="number" min={1} max={31} defaultValue={matchup.gamesPerMatchup} disabled={locked} className="w-full border border-line bg-white p-2 text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500" /></td>
                    <td className="p-3"><input name={`courtLabel-${matchup.id}`} defaultValue={matchup.courtLabel ?? ""} className="w-full border border-line bg-white p-2 text-sm font-bold" /></td>
                    <td className="p-3"><input name={`scheduledAt-${matchup.id}`} type="datetime-local" defaultValue={manilaDateTimeValue(matchup.scheduledAt)} className="w-full border border-line bg-white p-2 text-sm font-bold" /></td>
                    <td className="p-3"><StatusBadge tone={locked ? "locked" : matchup.status === "SCHEDULED" ? "warn" : "ready"}>{locked ? "Protected" : displayStatus(matchup.status)}</StatusBadge>{locked && <div className="mt-1 text-[11px] text-gray-500">Games count locked</div>}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          </form>}
          <div className="grid gap-3 2xl:grid-cols-2">
            {selected.matchups.map((matchup) => {
              const locked = matchupLocked(matchup);
              return <article key={matchup.id} className={`border p-4 ${locked ? "border-amber-300 bg-amber-50" : "border-line bg-white"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{matchup.homeTeam?.shortName || "TBD"} vs {matchup.awayTeam?.shortName || "TBD"}</h3><StatusBadge tone={locked ? "locked" : matchup.status === "SCHEDULED" ? "warn" : "ready"}>{locked ? "Protected" : displayStatus(matchup.status)}</StatusBadge></div><div className="mt-1 text-xs text-gray-500">{matchup.stage.replaceAll("_", " ")} - {matchup.groupLabel || "No scope"} - {matchup.roundLabel} - {matchup.gamesPerMatchup} game{matchup.gamesPerMatchup === 1 ? "" : "s"} - Court {matchup.courtLabel || "TBA"}</div></div><div className="flex flex-wrap items-center gap-2">{matchup.games.length === matchup.gamesPerMatchup && matchup.games.length > 0 && <Link href={`/admin/matches/${matchup.id}/scorecards`} className="btn-ghost px-3 py-2 text-xs">Print scorecards</Link>}{locked && <div className="max-w-md text-xs font-bold text-amber-950">Recorded play exists. Competitors, stage, and game count are protected; metadata can still be corrected.</div>}</div></div>
                <details className="mt-3 border border-line bg-white p-3" open={!locked && (!matchup.homeTeamId || !matchup.awayTeamId || !matchup.courtLabel)}>
                  <summary className="cursor-pointer text-xs font-black uppercase">Edit matchup</summary>
                  <form action="/api/admin/tournament-structure" method="post" className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <input type="hidden" name="action" value="update-matchup" />
                    <input type="hidden" name="matchupId" value={matchup.id} />
                    <input type="hidden" name="divisionId" value={selected.id} />
                    <Select label="Stage" name="stage" defaultValue={matchup.stage}>{stages.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select>
                    <Field label="Scope / group label" name="groupLabel" defaultValue={matchup.groupLabel} />
                    <Select label="Home team" name="homeTeamId" defaultValue={matchup.homeTeamId}><option value="">TBD</option>{selected.teams.map((team) => <option key={team.id} value={team.id}>{team.shortName} - {team.name}</option>)}</Select>
                    <Select label="Away team" name="awayTeamId" defaultValue={matchup.awayTeamId}><option value="">TBD</option>{selected.teams.map((team) => <option key={team.id} value={team.id}>{team.shortName} - {team.name}</option>)}</Select>
                    <Field label="Games" name="gamesPerMatchup" type="number" min={1} max={31} defaultValue={matchup.gamesPerMatchup} />
                    <Field label="Court" name="courtLabel" defaultValue={matchup.courtLabel} />
                    <Field label="Round label" name="roundLabel" defaultValue={matchup.roundLabel} required />
                    <Field label="Schedule (Manila)" name="scheduledAt" type="datetime-local" defaultValue={manilaDateTimeValue(matchup.scheduledAt)} />
                    <div className="md:col-span-2 xl:col-span-4 flex flex-wrap gap-2"><SubmitButton className="btn-primary px-3 py-2 text-xs" pendingLabel="Saving...">Save matchup</SubmitButton></div>
                  </form>
                  {!locked && <form action="/api/admin/tournament-structure" method="post" className="mt-2"><input type="hidden" name="action" value="delete-matchup"/><input type="hidden" name="matchupId" value={matchup.id}/><SubmitButton className="btn-ghost px-3 py-2 text-xs text-red-700" pendingLabel="Deleting...">Delete future matchup</SubmitButton></form>}
                </details>
              </article>;
            })}
          </div>
          {!selected.matchups.length && <EmptyState text="No matchups configured yet. Generate a round robin or add future matchups manually once teams are known." />}
        </section>
      </div>
    </section>
  </main>;
}
