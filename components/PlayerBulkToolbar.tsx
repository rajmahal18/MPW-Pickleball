"use client";

import { useState } from "react";
import SubmitButton from "@/components/SubmitButton";

type Team = { id: string; name: string; shortName: string; divisionName: string };
type Division = { id: string; name: string };

export default function PlayerBulkToolbar({ teams, divisions }: { teams: Team[]; divisions: Division[] }) {
  const [action, setAction] = useState("assign-team");
  return <form id="player-bulk-form" action="/api/admin/master-data" method="post" className="grid gap-3 lg:grid-cols-[180px_1fr_auto] lg:items-end">
    <input type="hidden" name="action" value="batch-players" />
    <label className="block">
      <span className="label">Batch action</span>
      <select name="batchAction" value={action} onChange={(event) => setAction(event.target.value)} className="mt-1 w-full border border-line bg-white p-3 text-sm font-bold">
        <option value="assign-team">Assign to team</option>
        <option value="unassign-team">Return to player pool</option>
        <option value="set-participation">Change attendance status</option>
        <option value="set-division-status">Change division eligibility</option>
      </select>
    </label>

    {action === "assign-team" && <label className="block"><span className="label">Destination team</span><select name="teamId" className="mt-1 w-full border border-line bg-white p-3 text-sm font-bold" required><option value="">Select team…</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.divisionName} · {team.shortName} — {team.name}</option>)}</select></label>}
    {action === "unassign-team" && <div className="border border-line bg-paper p-3 text-sm text-gray-600">Selected players will be unassigned from their current team and returned to the pool. Recorded play remains protected.</div>}
    {action === "set-participation" && <label className="block"><span className="label">Attendance status</span><select name="participationStatus" className="mt-1 w-full border border-line bg-white p-3 text-sm font-bold"><option value="CONFIRMED">Confirmed</option><option value="POOL">Pool / tentative</option><option value="UNAVAILABLE">Unavailable</option><option value="WITHDRAWN">Withdrawn</option></select></label>}
    {action === "set-division-status" && <div className="grid gap-3 sm:grid-cols-2"><label><span className="label">Division</span><select name="divisionId" className="mt-1 w-full border border-line bg-white p-3 text-sm font-bold" required><option value="">Select division…</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label><label><span className="label">Eligibility status</span><select name="divisionStatus" className="mt-1 w-full border border-line bg-white p-3 text-sm font-bold"><option value="CONFIRMED">Confirmed</option><option value="ELIGIBLE">Eligible</option><option value="UNAVAILABLE">Unavailable</option><option value="WITHDRAWN">Withdrawn</option></select></label></div>}

    <SubmitButton className="btn-primary min-h-11" pendingLabel="Applying…">Apply to selected</SubmitButton>
  </form>;
}
