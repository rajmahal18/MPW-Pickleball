import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { computeStandings, selectQualifiers } from "../lib/tournament/standings";
import { calculateMvpRankings } from "../lib/tournament/mvp";
import { createSeededRandom } from "../lib/tournament/rng";
import { qrMatrix } from "../lib/qr";
import { normalizeVotingCode } from "../lib/tournament/voting";

function team(id: string, name: string, groupName: string) {
  return { id, name, shortName: id, logoUrl: null, groupId: groupName, group: { name: groupName, slug: groupName.toLowerCase() } } as never;
}
function matchup(id: string, homeTeamId: string, awayTeamId: string, homeWins: number, awayWins: number) {
  return { id, tournamentId: "t", stage: "GROUP", groupLabel: "Group A", roundLabel: id, roundNumber: 1, order: 1, homeTeamId, awayTeamId, status: "COMPLETED", scheduledAt: null, courtLabel: null, winnerTeamId: homeWins > awayWins ? homeTeamId : awayTeamId, homeWins, awayWins, version: 0, createdAt: new Date(), updatedAt: new Date() } as never;
}

test("standings rank by points, head-to-head, differential, and game wins", () => {
  const teams = [team("A", "Alpha", "Group A"), team("B", "Bravo", "Group A"), team("C", "Charlie", "Group A")];
  const rows = computeStandings(teams, [matchup("1", "A", "B", 4, 3), matchup("2", "B", "C", 7, 0), matchup("3", "C", "A", 4, 3)]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]!.team.id, "B");
  assert.equal(rows[0]!.points, 3);
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
