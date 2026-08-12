import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import type { Matchup } from "@prisma/client";
import { computeStandings, selectDivisionQualifiers, selectQualifiers } from "../lib/tournament/standings";
import { calculateMvpRankings } from "../lib/tournament/mvp";
import { createSeededRandom } from "../lib/tournament/rng";
import { qrMatrix } from "../lib/qr";
import { normalizeVotingCode } from "../lib/tournament/voting";
import { formatPlayerDisplayName, formatPlayerFullName } from "../lib/player-name";
import { assertValidCompletedScore, gamesForStage } from "../lib/tournament/rules";

function team(id: string, name: string, groupName: string) {
  return { id, name, shortName: id, logoUrl: null, groupId: groupName, group: { name: groupName, slug: groupName.toLowerCase() } } as never;
}
function matchup(
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  homeWins: number,
  awayWins: number,
  scores: Array<[number, number]> = [],
): Matchup & { games: Array<{ homeScore: number; awayScore: number; status: "COMPLETED" }> } {
  return {
    id, tournamentId: "t", divisionId: "d", stage: "GROUP", groupLabel: "Group A", roundLabel: id, roundNumber: 1, order: 1,
    gamesPerMatchup: homeWins + awayWins || Math.max(1, scores.length), homeTeamId, awayTeamId, status: "COMPLETED", scheduledAt: null, courtLabel: null,
    winnerTeamId: homeWins === awayWins ? null : homeWins > awayWins ? homeTeamId : awayTeamId, homeWins, awayWins, version: 0, createdAt: new Date(), updatedAt: new Date(),
    games: scores.map(([homeScore, awayScore]) => ({ homeScore, awayScore, status: "COMPLETED" as const })),
  };
}

test("standings rank by team-matchup record, head-to-head, game results, then scoring point differential", () => {
  const teams = [team("A", "Alpha", "Group A"), team("B", "Bravo", "Group A"), team("C", "Charlie", "Group A")];
  const rows = computeStandings(teams, [
    matchup("1", "A", "B", 4, 3, [[11, 7], [11, 7], [11, 7], [11, 7], [7, 11], [7, 11], [7, 11]]),
    matchup("2", "B", "C", 7, 0, [[11, 5], [11, 5], [11, 5], [11, 5], [11, 5], [11, 5], [11, 5]]),
    matchup("3", "C", "A", 4, 3, [[11, 9], [11, 9], [11, 9], [11, 9], [9, 11], [9, 11], [9, 11]]),
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]!.team.id, "B");
  assert.equal(rows[0]!.points, 38);
  assert.equal(rows[0]!.differential, 6);
});

test("wildcard comes from the best second-place row", () => {
  const tables = ["A", "B", "C"].map((group) => [
    { team: team(`${group}1`, `${group} Winner`, group), points: 9, headToHeadPoints: 0, differential: 12, gameWins: 15, gameLosses: 3, played: 3, won: 3, lost: 0 },
    { team: team(`${group}2`, `${group} Runner`, group), points: group === "B" ? 6 : 3, headToHeadPoints: 0, differential: group === "B" ? 5 : 1, gameWins: 10, gameLosses: 8, played: 3, won: 2, lost: 1 },
  ]);
  assert.equal(selectQualifiers(tables as never).wildcard?.team.id, "B2");
});

test("cross-group wildcard comparison ignores unrelated head-to-head points", () => {
  const tables = [
    [
      { team: team("A1", "A Winner", "A"), points: 9, headToHeadPoints: 0, differential: 10, gameWins: 15, gameLosses: 5, played: 3, won: 3, lost: 0 },
      { team: team("A2", "A Runner", "A"), points: 6, headToHeadPoints: 6, differential: 2, gameWins: 11, gameLosses: 9, played: 3, won: 2, lost: 1 },
    ],
    [
      { team: team("B1", "B Winner", "B"), points: 9, headToHeadPoints: 0, differential: 12, gameWins: 16, gameLosses: 4, played: 3, won: 3, lost: 0 },
      { team: team("B2", "B Runner", "B"), points: 6, headToHeadPoints: 0, differential: 5, gameWins: 12, gameLosses: 7, played: 3, won: 2, lost: 1 },
    ],
  ];
  assert.equal(selectQualifiers(tables as never).wildcard?.team.id, "B2");
});


test("division qualifiers honor configurable direct and wildcard counts", () => {
  const tables = ["A", "B"].map((group) => [
    { team: team(`${group}1`, `${group} 1`, group), points: 9, headToHeadPoints: 0, differential: 10, gameWins: 15, gameLosses: 5, played: 3, won: 3, lost: 0 },
    { team: team(`${group}2`, `${group} 2`, group), points: 6, headToHeadPoints: 0, differential: group === "B" ? 6 : 4, gameWins: 12, gameLosses: 8, played: 3, won: 2, lost: 1 },
    { team: team(`${group}3`, `${group} 3`, group), points: 3, headToHeadPoints: 0, differential: 0, gameWins: 9, gameLosses: 9, played: 3, won: 1, lost: 2 },
  ]);
  const selected = selectDivisionQualifiers(tables as never, 1, 2);
  assert.equal(selected.direct.length, 2);
  assert.deepEqual(selected.wildcards.map((row) => row.team.id), ["B2", "A2"]);
  assert.equal(selected.qualifiers.length, 4);
});

test("division qualifiers stay empty while group stage is incomplete", () => {
  const table = [
    { team: team("A1", "A Winner", "A"), points: 3, headToHeadPoints: 0, differential: 1, gameWins: 1, gameLosses: 0, played: 0, won: 0, lost: 0, rank: 1, rankLabel: "1", rankStatus: "RESOLVED", tieGroupKey: null, tiebreakApplied: false },
    { team: team("A2", "A Runner", "A"), points: 0, headToHeadPoints: 0, differential: -1, gameWins: 0, gameLosses: 1, played: 0, won: 0, lost: 0, rank: 2, rankLabel: "2", rankStatus: "RESOLVED", tieGroupKey: null, tiebreakApplied: false },
  ];
  const selected = selectDivisionQualifiers([table] as never, 1, 0, { groupStageComplete: false });
  assert.equal(selected.direct.length, 0);
  assert.equal(selected.wildcards.length, 0);
  assert.equal(selected.qualifiers.length, 0);
  assert.equal(selected.unresolved.length, 1);
});

test("pending group matchups do not display actionable ties", () => {
  const teams = [team("A", "Alpha", "Group A"), team("B", "Bravo", "Group A"), team("C", "Charlie", "Group A")];
  const pending = { ...matchup("pending", "A", "B", 0, 0), status: "SCHEDULED", winnerTeamId: null } as never;
  const rows = computeStandings(teams, [pending]);
  assert.deepEqual(rows.map((row) => row.rankLabel), ["1", "2", "3"]);
  assert.ok(rows.every((row) => row.rankStatus === "RESOLVED"));
  assert.ok(rows.every((row) => row.tieGroupKey === null));
});

test("a finalized pair game updates live Games/Diff/Pts before the team matchup is complete", () => {
  const teams = [team("A", "Alpha", "Group A"), team("B", "Bravo", "Group A")];
  const live = { ...matchup("live", "A", "B", 1, 0, [[11, 7]]), status: "LIVE", winnerTeamId: null } as never;
  const rows = computeStandings(teams, [live]);
  const alpha = rows.find((row) => row.team.id === "A")!;
  const bravo = rows.find((row) => row.team.id === "B")!;
  assert.equal(alpha.gameWins, 1);
  assert.equal(alpha.gameLosses, 0);
  assert.equal(alpha.differential, 1);
  assert.equal(bravo.gameWins, 0);
  assert.equal(bravo.gameLosses, 1);
  assert.equal(alpha.played, 0);
  assert.equal(alpha.points, 4);
  assert.equal(bravo.points, -4);
  assert.ok(rows.every((row) => row.rankStatus === "RESOLVED"));
});

test("Pts is the cumulative scoring differential from decided pair games and ignores an unfinished game", () => {
  const teams = [team("A", "CCDEO", "Group A"), team("B", "RO1", "Group A")];
  const live = {
    ...matchup("live-points", "A", "B", 2, 1, [[11, 7], [7, 11], [11, 6]]),
    status: "LIVE",
    winnerTeamId: null,
    games: [
      { homeScore: 11, awayScore: 7, status: "COMPLETED" },
      { homeScore: 7, awayScore: 11, status: "COMPLETED" },
      { homeScore: 11, awayScore: 6, status: "COMPLETED" },
      { homeScore: 8, awayScore: 6, status: "LIVE" },
    ],
  } as never;
  const rows = computeStandings(teams, [live]);
  const ccdeo = rows.find((row) => row.team.id === "A")!;
  const ro1 = rows.find((row) => row.team.id === "B")!;
  assert.equal(ccdeo.gameWins, 2);
  assert.equal(ccdeo.gameLosses, 1);
  assert.equal(ccdeo.differential, 1);
  assert.equal(ccdeo.points, 5);
  assert.equal(ro1.points, -5);
  assert.ok(rows.every((row) => row.played === 0 && row.won === 0 && row.lost === 0));
});

test("scoring point differential breaks an otherwise equal completed group record", () => {
  const teams = [team("A", "Alpha", "Group A"), team("B", "Bravo", "Group A"), team("C", "Charlie", "Group A")];
  const rows = computeStandings(teams, [
    matchup("ab", "A", "B", 1, 0, [[11, 5]]),
    matchup("bc", "B", "C", 1, 0, [[11, 7]]),
    matchup("ca", "C", "A", 1, 0, [[11, 8]]),
  ]);
  assert.deepEqual(rows.map((row) => row.team.id), ["A", "C", "B"]);
  assert.deepEqual(rows.map((row) => row.points), [3, -1, -2]);
  assert.ok(rows.every((row) => row.rankStatus === "RESOLVED"));
});

test("an even-game tied team matchup does not invent a standings winner", () => {
  const teams = [team("A", "Alpha", "Group A"), team("B", "Bravo", "Group A")];
  const rows = computeStandings(teams, [matchup("tie", "A", "B", 2, 2)]);
  assert.equal(rows[0]!.points, 0);
  assert.equal(rows[1]!.points, 0);
  assert.equal(rows[0]!.won + rows[1]!.won, 0);
  assert.equal(rows[0]!.rankLabel, "T1");
  assert.equal(rows[1]!.rankLabel, "T1");
  assert.equal(rows[0]!.rankStatus, "TIED");
});

test("exact standings ties remain unresolved until an organizer tiebreak is saved", () => {
  const teams = [team("A", "Alpha", "Group A"), team("B", "Bravo", "Group A"), team("C", "Charlie", "Group A")];
  const rows = computeStandings(teams, [
    matchup("1", "A", "B", 3, 0),
    matchup("2", "B", "C", 3, 0),
    matchup("3", "C", "A", 3, 0),
  ]);
  assert.deepEqual(rows.map((row) => row.rankLabel), ["T1", "T1", "T1"]);
  assert.ok(rows.every((row) => row.rankStatus === "TIED"));

  const resolved = computeStandings(teams, [
    matchup("1", "A", "B", 3, 0),
    matchup("2", "B", "C", 3, 0),
    matchup("3", "C", "A", 3, 0),
  ], [{ teamId: "C", position: 1 }, { teamId: "A", position: 2 }, { teamId: "B", position: 3 }]);
  assert.deepEqual(resolved.map((row) => row.team.id), ["C", "A", "B"]);
  assert.deepEqual(resolved.map((row) => row.rankLabel), ["1", "2", "3"]);
  assert.ok(resolved.every((row) => row.tiebreakApplied));
});

test("division qualifiers block knockout slots when a qualifying tie is unresolved", () => {
  const teams = [team("A", "Alpha", "Group A"), team("B", "Bravo", "Group A"), team("C", "Charlie", "Group A")];
  const table = computeStandings(teams, [
    matchup("1", "A", "B", 3, 0),
    matchup("2", "B", "C", 3, 0),
    matchup("3", "C", "A", 3, 0),
  ]);
  const selected = selectDivisionQualifiers([table], 1, 0);
  assert.equal(selected.direct.length, 0);
  assert.equal(selected.qualifiers.length, 0);
  assert.equal(selected.unresolved.length, 1);
  assert.equal(selected.unresolved[0]!.scope, "DIRECT");
});

test("MVP rankings stay sex-separated and disclose locked-pair derivation", () => {
  const player = (id: string, sex: "MALE" | "FEMALE") => ({ id, firstName: id, lastName: "Player", displayName: id, avatarUrl: null, sex, team: { id: `T${id}`, name: `Team ${id}`, shortName: `T${id}` } });
  const maleA = player("MA", "MALE"), femaleA = player("FA", "FEMALE"), maleB = player("MB", "MALE"), femaleB = player("FB", "FEMALE");
  const games = [1, 2, 3, 4].map((index) => ({ id: String(index), homeScore: 11, awayScore: 7, winnerTeamId: "TMA", homeTeamId: "TMA", awayTeamId: "TMB", status: "COMPLETED", homePair: { id: "P1", playerA: maleA, playerB: femaleA }, awayPair: { id: "P2", playerA: maleB, playerB: femaleB } }));
  const result = calculateMvpRankings(games);
  assert.equal(result.male[0]!.player.id, "MA");
  assert.equal(result.female[0]!.player.id, "FA");
  assert.equal(result.male[0]!.mvpIndex, result.female[0]!.mvpIndex);
  assert.equal(result.male[0]!.lockedPairDerived, true);
});

test("simulation RNG is deterministic", () => {
  const first = createSeededRandom("20260729");
  const second = createSeededRandom("20260729");
  assert.deepEqual([first(), first(), first()], [second(), second(), second()]);
});

test("printed voting codes normalize and render a Version 1 QR matrix", () => {
  assert.equal(normalizeVotingCode("abcde-23456"), "ABCDE23456");
  const matrix = qrMatrix("ABCDE23456");
  assert.equal(matrix.length, 21);
  assert.ok(matrix.every((row) => row.length === 21));
  assert.equal(matrix[0]![0], true);
  assert.equal(matrix[6]![6], true);
  const fingerprint = createHash("sha256").update(matrix.flat().map((value) => value ? "1" : "0").join("")).digest("hex");
  assert.equal(fingerprint, "ba19963d9a31e33b98d257d3124e09b2a0e54e5c699d2753909eff3027237543");
});

test("player names render official full names without nulls or double spaces", () => {
  assert.equal(formatPlayerFullName({ firstName: "Ryan Ibrahim", middleInitial: "L", lastName: "Elias" }), "Ryan Ibrahim L. Elias");
  assert.equal(formatPlayerFullName({ firstName: "Jihan", middleInitial: null, lastName: "Arimao" }), "Jihan Arimao");
  assert.equal(formatPlayerDisplayName({ firstName: "Ryan", middleInitial: "L.", lastName: "Elias", displayName: "Coach Ryan" }), "Coach Ryan");
});


test("stage game rules keep group play and knockout play independently configurable", () => {
  const division = { defaultGamesPerMatchup: 7, knockoutGamesPerMatchup: 5 };
  assert.equal(gamesForStage(division, "GROUP"), 7);
  assert.equal(gamesForStage(division, "ROUND_ROBIN"), 7);
  assert.equal(gamesForStage(division, "QUARTERFINAL"), 5);
  assert.equal(gamesForStage(division, "SEMIFINAL"), 5);
  assert.equal(gamesForStage(division, "THIRD_PLACE"), 5);
  assert.equal(gamesForStage(division, "FINAL"), 5);
});

test("sudden death at 10-10 allows 11-10 while normal scoring still requires win by two", () => {
  assert.throws(() => assertValidCompletedScore(11, 10, false), /two-point/);
  assert.doesNotThrow(() => assertValidCompletedScore(11, 10, true));
  assert.doesNotThrow(() => assertValidCompletedScore(11, 9, false));
  assert.doesNotThrow(() => assertValidCompletedScore(12, 10, false));
  assert.doesNotThrow(() => assertValidCompletedScore(13, 11, false));
  assert.throws(() => assertValidCompletedScore(12, 9, false), /ends at 11/);
  assert.throws(() => assertValidCompletedScore(14, 11, false), /first two-point lead/);
  assert.throws(() => assertValidCompletedScore(12, 11, true), /must end on the next point/);
  assert.throws(() => assertValidCompletedScore(12, 9, true), /ends at 11/);
  assert.throws(() => assertValidCompletedScore(10, 9, true), /reach 11/);
});
