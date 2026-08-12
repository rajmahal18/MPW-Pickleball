import type { DivisionFormat, MatchupStage } from "@prisma/client";

type GuideDivision = {
  id: string;
  name: string;
  formatType: DivisionFormat;
  defaultGamesPerMatchup: number;
  knockoutGamesPerMatchup: number | null;
  thirdPlaceEnabled: boolean;
  suddenDeathAtTen: boolean;
  qualifiersPerGroup: number;
  wildcardCount: number;
  autoProgression: boolean;
  advancementRule: string | null;
  guideNotes: string | null;
  groups: Array<{ name: string; teams: Array<{ id: string }> }>;
  teams: Array<{ id: string }>;
  matchups: Array<{ stage: MatchupStage; status: string; gamesPerMatchup: number }>;
  playerEntries: Array<{ status: string; player: { participationStatus: string; teamId: string | null; team: { divisionId: string } | null } }>;
};

const FORMAT_LABELS: Record<DivisionFormat, string> = {
  GROUP_KNOCKOUT: "Group stage + knockout",
  ROUND_ROBIN: "Round robin",
  SINGLE_ELIMINATION: "Single elimination",
  CUSTOM: "Custom / organizer-controlled",
};

const STAGE_ORDER: MatchupStage[] = ["GROUP", "ROUND_ROBIN", "QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE", "CUSTOM"];

const STAGE_LABELS: Record<MatchupStage, string> = {
  GROUP: "Group stage",
  ROUND_ROBIN: "Round robin",
  QUARTERFINAL: "Quarterfinals",
  SEMIFINAL: "Semifinals",
  FINAL: "Final",
  THIRD_PLACE: "Third-place match",
  CUSTOM: "Custom stage",
};

export function buildDivisionGuide(division: GuideDivision) {
  const confirmed = division.playerEntries.filter((entry) => entry.status === "CONFIRMED" && entry.player.participationStatus === "CONFIRMED");
  const assigned = confirmed.filter((entry) => entry.player.teamId && entry.player.team?.divisionId === division.id).length;
  const stageCounts = new Map<MatchupStage, number>();
  for (const matchup of division.matchups) stageCounts.set(matchup.stage, (stageCounts.get(matchup.stage) ?? 0) + 1);
  const stages = [...stageCounts.entries()]
    .sort(([a], [b]) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
    .map(([stage, count]) => ({
      title: STAGE_LABELS[stage],
      detail: `${count} configured matchup${count === 1 ? "" : "s"}`,
    }));

  const rules: string[] = [];
  rules.push(`${FORMAT_LABELS[division.formatType]}.`);
  rules.push(`${division.defaultGamesPerMatchup} pair game${division.defaultGamesPerMatchup === 1 ? "" : "s"} per group/default matchup; knockout stages use ${division.knockoutGamesPerMatchup ?? division.defaultGamesPerMatchup}. Individual matchups may still override this.`);
  if (division.thirdPlaceEnabled) rules.push("A Battle for 3rd is enabled and is populated by the semifinal losers when automatic progression is active.");
  rules.push(division.suddenDeathAtTen ? "At 10-10, the next point wins (sudden death)." : "Games continue under the normal win-by-two rule after 10-10.");
  if (division.groups.length) {
    rules.push(`${division.groups.length} group${division.groups.length === 1 ? "" : "s"}, with ${division.teams.length} team${division.teams.length === 1 ? "" : "s"} currently assigned.`);
    if (division.formatType === "GROUP_KNOCKOUT") {
      rules.push(`${division.qualifiersPerGroup} qualifier${division.qualifiersPerGroup === 1 ? "" : "s"} per group${division.wildcardCount ? ` plus ${division.wildcardCount} wildcard slot${division.wildcardCount === 1 ? "" : "s"}` : ""}.`);
    }
  } else {
    rules.push(`${division.teams.length} team${division.teams.length === 1 ? "" : "s"} currently configured; groups are not required.`);
  }
  rules.push(`${confirmed.length} confirmed player${confirmed.length === 1 ? "" : "s"}; ${assigned} currently assigned to teams. Unassigned confirmed players remain in the player pool.`);
  rules.push(division.autoProgression ? "Automatic progression is enabled where the configured format is supported." : "Progression is organizer-controlled, so late bracket changes can be made manually.");
  if (division.advancementRule) rules.push(division.advancementRule);
  if (division.guideNotes) rules.push(division.guideNotes);

  return { formatLabel: FORMAT_LABELS[division.formatType], stages, rules, confirmedPlayers: confirmed.length, assignedPlayers: assigned };
}
