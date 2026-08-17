"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, RotateCcw, Save } from "lucide-react";

const UNASSIGNED = "__unassigned__";

type GroupOption = { id: string; name: string };
type TeamOption = { id: string; name: string; shortName: string; groupId: string | null; groupPosition: number | null };
type Columns = Record<string, string[]>;

function buildColumns(groups: GroupOption[], teams: TeamOption[]) {
  const columns: Columns = { [UNASSIGNED]: [] };
  for (const group of groups) columns[group.id] = [];

  const orderedTeams = [...teams].sort((first, second) => {
    const firstPosition = first.groupPosition ?? Number.MAX_SAFE_INTEGER;
    const secondPosition = second.groupPosition ?? Number.MAX_SAFE_INTEGER;
    return firstPosition - secondPosition || first.shortName.localeCompare(second.shortName) || first.name.localeCompare(second.name);
  });
  for (const team of orderedTeams) {
    const key = team.groupId && columns[team.groupId] ? team.groupId : UNASSIGNED;
    columns[key]!.push(team.id);
  }
  return columns;
}

function signature(columns: Columns, groups: GroupOption[]) {
  return [UNASSIGNED, ...groups.map((group) => group.id)].map((key) => `${key}:${(columns[key] ?? []).join(",")}`).join("|");
}

export default function GroupAssignmentBoard({
  divisionId,
  groups,
  teams,
  futureGroupMatchupCount,
  assignmentLocked,
}: {
  divisionId: string;
  groups: GroupOption[];
  teams: TeamOption[];
  futureGroupMatchupCount: number;
  assignmentLocked: boolean;
}) {
  const router = useRouter();
  const baseColumns = useMemo(() => buildColumns(groups, teams), [groups, teams]);
  const baseSignature = useMemo(() => signature(baseColumns, groups), [baseColumns, groups]);
  const [columns, setColumns] = useState<Columns>(baseColumns);
  const [savedSignature, setSavedSignature] = useState(baseSignature);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setColumns(baseColumns);
    setSavedSignature(baseSignature);
    setSelectedId(null);
  }, [baseColumns, baseSignature]);

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const currentSignature = signature(columns, groups);
  const dirty = currentSignature !== savedSignature;
  const teamColumn = useMemo(() => {
    const map = new Map<string, string>();
    for (const [key, ids] of Object.entries(columns)) for (const id of ids) map.set(id, key);
    return map;
  }, [columns]);

  function moveTeam(teamId: string, destination: string) {
    if (assignmentLocked || teamColumn.get(teamId) === destination) return;
    setColumns((current) => {
      const next: Columns = {};
      for (const [key, ids] of Object.entries(current)) next[key] = ids.filter((id) => id !== teamId);
      next[destination] = [...(next[destination] ?? []), teamId];
      return next;
    });
    setSelectedId(null);
    setMessage("");
    setError("");
  }

  function onDragStart(event: DragEvent<HTMLButtonElement>, teamId: string) {
    if (assignmentLocked) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", teamId);
  }

  function onDrop(event: DragEvent<HTMLDivElement>, destination: string) {
    event.preventDefault();
    const teamId = event.dataTransfer.getData("text/plain");
    if (teamById.has(teamId)) moveTeam(teamId, destination);
  }

  async function save() {
    if (!dirty || saving || assignmentLocked) return;
    if (futureGroupMatchupCount > 0) {
      const confirmed = window.confirm(`${futureGroupMatchupCount} generated group matchup${futureGroupMatchupCount === 1 ? "" : "s"} will be cleared so they can be regenerated from the new draw. Recorded results are protected and cannot be changed. Continue?`);
      if (!confirmed) return;
    }

    const indexByTeam = new Map<string, { groupId: string | null; groupPosition: number | null }>();
    for (const group of groups) {
      (columns[group.id] ?? []).forEach((teamId, index) => indexByTeam.set(teamId, { groupId: group.id, groupPosition: index + 1 }));
    }
    for (const teamId of columns[UNASSIGNED] ?? []) indexByTeam.set(teamId, { groupId: null, groupPosition: null });

    const assignments = teams.map((team) => ({ teamId: team.id, ...(indexByTeam.get(team.id) ?? { groupId: null, groupPosition: null }) }));
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/tournament-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-group-assignment": "1" },
        body: JSON.stringify({
          action: "bulk-assign-team-groups",
          divisionId,
          assignments,
          resetUnplayedGroupMatchups: futureGroupMatchupCount > 0,
        }),
      });
      const payload = await response.json().catch(() => ({ message: "Unable to save group assignments." }));
      if (!response.ok) throw new Error(payload.message || "Unable to save group assignments.");
      const nextSignature = signature(columns, groups);
      setSavedSignature(nextSignature);
      setSelectedId(null);
      setMessage(payload.message || "Group assignments saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save group assignments.");
    } finally {
      setSaving(false);
    }
  }

  const destinations = [{ id: UNASSIGNED, name: "Unassigned" }, ...groups];

  return <section className="mb-5 rounded-xl border border-court/25 bg-court/5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="label text-court">Draw helper</div>
        <h3 className="mt-1 text-lg font-black uppercase text-ink">Group assignment board</h3>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">Drag teams between groups on desktop. On touch screens, tap a team and choose where to move it.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setColumns(baseColumns); setSelectedId(null); setMessage(""); setError(""); }} disabled={!dirty || saving} className="btn-ghost min-h-10 rounded-md px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="h-4 w-4"/>Reset</button>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving || assignmentLocked} className="btn-primary min-h-10 rounded-md px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-4 w-4"/>{saving ? "Saving..." : "Save assignments"}</button>
      </div>
    </div>

    {assignmentLocked && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-950">Group assignment is locked because recorded play already exists in this division. Tournament history will not be rewritten.</div>}
    {!assignmentLocked && futureGroupMatchupCount > 0 && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">Generated group matchups already exist. If you save a changed draw, those unplayed group matchups will be cleared and must be generated again.</div>}

    <div className={`mt-4 grid gap-3 ${groups.length >= 3 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3"}`}>
      {destinations.map((destination) => {
        const ids = columns[destination.id] ?? [];
        return <div key={destination.id} onDragOver={(event) => { if (!assignmentLocked) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={(event) => onDrop(event, destination.id)} className={`min-h-36 rounded-lg border p-3 ${destination.id === UNASSIGNED ? "border-dashed border-gray-300 bg-white/70" : "border-line bg-white"}`}>
          <div className="mb-2 flex items-center justify-between gap-2"><strong className="text-sm font-black uppercase text-ink">{destination.name}</strong><span className="rounded-full bg-paper px-2 py-1 text-[10px] font-black text-gray-500">{ids.length}</span></div>
          <div className="space-y-2">{ids.map((teamId) => {
            const team = teamById.get(teamId);
            if (!team) return null;
            const selected = selectedId === teamId;
            return <div key={team.id}>
              <button type="button" draggable={!assignmentLocked} onDragStart={(event) => onDragStart(event, team.id)} onClick={() => !assignmentLocked && setSelectedId((current) => current === team.id ? null : team.id)} className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition ${selected ? "border-court bg-court/10 ring-2 ring-court/15" : "border-line bg-paper hover:border-court/40"} ${assignmentLocked ? "cursor-default opacity-75" : "cursor-grab active:cursor-grabbing"}`}>
                <GripVertical className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true"/>
                <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-ink">{team.shortName}</strong><span className="block truncate text-[10px] text-gray-500">{team.name}</span></span>
              </button>
              {selected && !assignmentLocked && <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-md border border-court/20 bg-court/5 p-2">
                {destinations.filter((item) => item.id !== destination.id).map((item) => <button key={item.id} type="button" onClick={() => moveTeam(team.id, item.id)} className="rounded-md border border-line bg-white px-2.5 py-1.5 text-[10px] font-black text-ink hover:border-court hover:text-court">{item.name}</button>)}
              </div>}
            </div>;
          })}{!ids.length && <div className="rounded-md border border-dashed border-line px-3 py-5 text-center text-xs text-gray-400">Drop teams here</div>}</div>
        </div>;
      })}
    </div>

    {message && <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{message}</div>}
    {error && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{error}</div>}
  </section>;
}
