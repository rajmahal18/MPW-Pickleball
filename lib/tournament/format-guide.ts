import type { DivisionEntrantType, DivisionFormat, MatchupStage } from "@prisma/client";
import { scoreRuleForStage, winsNeededForMatchup } from "@/lib/tournament/rules";

type GuideDivision = {
  id: string;
  name: string;
  formatType: DivisionFormat;
  entrantType: DivisionEntrantType;
  defaultGamesPerMatchup: number;
  knockoutGamesPerMatchup: number | null;
  thirdPlaceEnabled: boolean;
  suddenDeathAtTen: boolean;
  qualifiersPerGroup: number;
  wildcardCount: number;
  wildcardMode: string;
  wildcardBattleSize: number;
  autoProgression: boolean;
  advancementRule: string | null;
  guideNotes: string | null;
  groups: Array<{ name: string; teams: Array<{ id: string }> }>;
  teams: Array<{ id: string; pairs?: Array<{ playerAId: string; playerBId: string; isActive: boolean }> }>;
  matchups: Array<{ stage: MatchupStage; status: string; gamesPerMatchup: number }>;
  playerEntries: Array<{ status: string; player: { id: string; participationStatus: string; teamId: string | null; team: { divisionId: string } | null } }>;
};

const FORMAT_LABELS: Record<DivisionFormat, string> = {
  GROUP_KNOCKOUT: "Group stage + knockout",
  ROUND_ROBIN: "Round robin",
  SINGLE_ELIMINATION: "Single elimination",
  CUSTOM: "Custom / organizer-controlled",
};

const STAGE_ORDER: MatchupStage[] = ["GROUP", "ROUND_ROBIN", "ROUND_OF_16", "QUARTERFINAL", "SEMIFINAL", "FINAL", "THIRD_PLACE", "CUSTOM"];

const STAGE_LABELS: Record<MatchupStage, string> = {
  GROUP: "Group stage",
  ROUND_ROBIN: "Round robin",
  ROUND_OF_16: "Round of 16",
  QUARTERFINAL: "Quarterfinals",
  SEMIFINAL: "Semifinals",
  FINAL: "Final",
  THIRD_PLACE: "Third-place match",
  CUSTOM: "Custom stage",
};

export function buildDivisionGuide(division: GuideDivision) {
  const confirmed = division.playerEntries.filter((entry) => entry.status === "CONFIRMED" && entry.player.participationStatus === "CONFIRMED");
  const fixedPairPlayerIds = new Set(division.teams.flatMap((team) => (team.pairs ?? []).filter((pair) => pair.isActive).flatMap((pair) => [pair.playerAId, pair.playerBId])));
  const assigned = division.entrantType === "PAIR"
    ? confirmed.filter((entry) => fixedPairPlayerIds.has(entry.player.id)).length
    : confirmed.filter((entry) => entry.player.teamId && entry.player.team?.divisionId === division.id).length;
  const entrantNoun = division.entrantType === "PAIR" ? "pair" : division.entrantType === "PLAYER" ? "player" : "team";
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
  const knockoutMatches = division.knockoutGamesPerMatchup ?? division.defaultGamesPerMatchup;
  const knockoutWinsNeeded = winsNeededForMatchup("FINAL", knockoutMatches)!;
  if (division.entrantType === "PAIR") rules.push("Each matchup is one fixed pair vs fixed pair match. Executive events do not use Team Event lineup submission.");
  else rules.push(`${division.defaultGamesPerMatchup} pair match${division.defaultGamesPerMatchup === 1 ? "" : "es"} per group/default matchup; knockout stages use up to ${knockoutMatches}. Individual matchups may still override this.`);
  if (division.thirdPlaceEnabled) rules.push("A Battle for 3rd is enabled and is populated by the semifinal losers when automatic progression is active.");
  if (division.formatType === "GROUP_KNOCKOUT" || division.formatType === "ROUND_ROBIN") {
    rules.push(`Group / round-robin scoring: ${scoreRuleForStage("GROUP").label}.`);
  }
  if (division.formatType === "GROUP_KNOCKOUT" || division.formatType === "SINGLE_ELIMINATION") {
    rules.push(`Playoff scoring: ${scoreRuleForStage("FINAL").label}.`);
    rules.push(`Semifinal, Final, and Battle for 3rd scoring: ${scoreRuleForStage("SEMIFINAL").label}.`);
    if (division.entrantType !== "PAIR") rules.push(`Knockout team matchups are best of ${knockoutMatches}: first to ${knockoutWinsNeeded} match wins. Once clinched, remaining pair-match slots are not played.`);
  }
  if (division.formatType === "CUSTOM") {
    rules.push(`Custom-stage scoring: ${scoreRuleForStage("CUSTOM", division.suddenDeathAtTen).label}.`);
  }
  if (division.groups.length) {
    rules.push(`${division.groups.length} group${division.groups.length === 1 ? "" : "s"}, with ${division.teams.length} ${entrantNoun}${division.teams.length === 1 ? "" : "s"} currently assigned.`);
    if (division.formatType === "GROUP_KNOCKOUT") {
      rules.push(division.wildcardMode === "BATTLE"
        ? `Group winners enter the Championship bracket. The best ${division.wildcardBattleSize} remaining standings rows enter a separate single-elimination tournament for the remaining wildcard slot.`
        : division.wildcardMode === "DIRECT"
          ? "Group winners plus the best remaining standings row advance directly to the Championship bracket."
          : `${division.qualifiersPerGroup} qualifier${division.qualifiersPerGroup === 1 ? "" : "s"} per group${division.wildcardCount ? ` plus ${division.wildcardCount} wildcard slot${division.wildcardCount === 1 ? "" : "s"}` : ""}.`);
    }
  } else {
    rules.push(`${division.teams.length} ${entrantNoun}${division.teams.length === 1 ? "" : "s"} currently configured; groups are not required.`);
  }
  rules.push(`${confirmed.length} confirmed player${confirmed.length === 1 ? "" : "s"}; ${assigned} currently assigned to ${division.entrantType === "PAIR" ? "fixed pairs" : entrantNoun + "s"}. Unassigned confirmed players remain in the player pool.`);
  rules.push(division.autoProgression ? "Automatic progression is enabled where the configured format is supported." : "Progression is organizer-controlled, so late bracket changes can be made manually.");
  if (division.advancementRule) rules.push(division.advancementRule);
  if (division.guideNotes) rules.push(division.guideNotes);

  return { formatLabel: FORMAT_LABELS[division.formatType], stages, rules, confirmedPlayers: confirmed.length, assignedPlayers: assigned };
}
