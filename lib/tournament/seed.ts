import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { EmploymentType, Prisma, SexCategory } from "@prisma/client";

type CsvRow = Record<string, string>;
type OfficialRosterPlayer = {
  firstName: string;
  middleInitial: string | null;
  lastName: string;
  displayName: string | null;
  employmentType: EmploymentType;
  sex: SexCategory;
  office: string;
};

const officialRosterPath = path.join(process.cwd(), "mpw_pickleball_official_player_pool.csv");

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseCsv(input: string): CsvRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (quoted && char === "\"" && next === "\"") {
      field += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);

  const [headers, ...dataRows] = rows;
  if (!headers) throw new Error("Official player pool CSV is empty.");
  return dataRows.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ""])));
}

function parseLegacyName(fullName: string) {
  const parts = normalize(fullName).split(" ");
  if (parts.length < 2) throw new Error(`Cannot split displayName into firstName/lastName: ${fullName}`);

  const lastNameParts = [parts.pop()!];
  const suffix = lastNameParts[0]!;
  if (/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(suffix) && parts.length >= 2) lastNameParts.unshift(parts.pop()!);

  const maybeMiddle = parts.at(-1);
  const middleInitial = maybeMiddle && /^[A-Z]\.$/i.test(maybeMiddle) ? parts.pop()! : null;
  return { firstName: parts.join(" "), middleInitial, lastName: lastNameParts.join(" ") };
}

function readOfficialRoster(): OfficialRosterPlayer[] {
  const roster = parseCsv(readFileSync(officialRosterPath, "utf8")).map((row) => {
    const hasStructuredName = "firstName" in row || "lastName" in row;
    const parsed = hasStructuredName
      ? { firstName: normalize(row.firstName ?? ""), middleInitial: normalize(row.middleInitial ?? "") || null, lastName: normalize(row.lastName ?? "") }
      : parseLegacyName(row.displayName ?? "");
    const employmentType = normalize(row.employmentType ?? "");
    const sex = normalize(row.sexCategory ?? "");

    if (!parsed.firstName || !parsed.lastName) throw new Error(`Official roster row has a blank name: ${JSON.stringify(row)}`);
    if (employmentType !== "PERMANENT" && employmentType !== "JOB_ORDER") throw new Error(`Invalid employmentType: ${employmentType}`);
    if (sex !== "MALE" && sex !== "FEMALE") throw new Error(`Invalid sexCategory: ${sex}`);

    return {
      ...parsed,
      displayName: hasStructuredName ? normalize(row.displayName ?? "") || null : null,
      employmentType: employmentType as EmploymentType,
      sex: sex as SexCategory,
      office: normalize(row.office ?? ""),
    };
  });

  if (roster.length !== 168) throw new Error(`Expected 168 official roster rows, found ${roster.length}.`);
  return roster;
}

export async function clearTournamentActivity(db: Prisma.TransactionClient, tournamentId: string) {
  await db.scoreEvent.deleteMany({ where: { game: { matchup: { tournamentId } } } });
  await db.game.deleteMany({ where: { matchup: { tournamentId } } });
  await db.lineup.deleteMany({ where: { matchup: { tournamentId } } });
  await db.matchup.deleteMany({ where: { tournamentId } });
  await db.fanVote.deleteMany({ where: { tournamentId } });
  await db.votingCode.deleteMany({ where: { tournamentId } });
  await db.voteAttempt.deleteMany({ where: { tournamentId } });
}

export async function createGroupFixtures(db: Prisma.TransactionClient, tournamentId: string, divisionId?: string) {
  const groups = await db.group.findMany({
    where: { tournamentId, ...(divisionId ? { divisionId } : {}) },
    include: {
      division: true,
      teams: { orderBy: [{ groupPosition: "asc" }, { shortName: "asc" }] },
    },
    orderBy: [{ division: { sortOrder: "asc" } }, { name: "asc" }],
  });

  const perDivisionOrder = new Map<string, number>();
  for (const group of groups) {
    let order = perDivisionOrder.get(group.divisionId) ?? 0;
    for (let homeIndex = 0; homeIndex < group.teams.length; homeIndex += 1) {
      for (let awayIndex = homeIndex + 1; awayIndex < group.teams.length; awayIndex += 1) {
        order += 1;
        await db.matchup.create({
          data: {
            tournamentId,
            divisionId: group.divisionId,
            stage: "GROUP",
            groupLabel: group.name,
            roundLabel: `Match ${order}`,
            roundNumber: order,
            order,
            gamesPerMatchup: group.division.defaultGamesPerMatchup,
            homeTeamId: group.teams[homeIndex]!.id,
            awayTeamId: group.teams[awayIndex]!.id,
            status: "LINEUP_PENDING",
          },
        });
      }
    }
    perDivisionOrder.set(group.divisionId, order);
  }
}

export async function rebuildActivityPreservingMasterData(db: Prisma.TransactionClient, tournamentId: string) {
  // Preserve the organizer's current divisions, groups, teams and matchup structure.
  // Resets are activity resets, not an excuse to silently return to the sample format.
  await db.scoreEvent.deleteMany({ where: { game: { matchup: { tournamentId } } } });
  await db.game.deleteMany({ where: { matchup: { tournamentId } } });
  await db.lineup.deleteMany({ where: { matchup: { tournamentId } } });
  const matchups = await db.matchup.findMany({ where: { tournamentId }, select: { id: true, homeTeamId: true, awayTeamId: true } });
  for (const matchup of matchups) {
    await db.matchup.update({
      where: { id: matchup.id },
      data: {
        homeWins: 0,
        awayWins: 0,
        winnerTeamId: null,
        status: matchup.homeTeamId && matchup.awayTeamId ? "LINEUP_PENDING" : "SCHEDULED",
        scheduledAt: null,
        courtLabel: null,
        queuePosition: null,
        version: { increment: 1 },
      },
    });
  }
  await db.fanVote.deleteMany({ where: { tournamentId } });
  await db.votingCode.deleteMany({ where: { tournamentId } });
  await db.voteAttempt.deleteMany({ where: { tournamentId } });
  await db.tournament.update({
    where: { id: tournamentId },
    data: { votingOpen: false, votingDeadline: null, simulationMode: true, activeCourtCount: 0 },
  });
}

export async function factorySeed(db: Prisma.TransactionClient) {
  await db.auditLog.deleteMany();
  await db.scoreEvent.deleteMany();
  await db.checkpoint.deleteMany();
  await db.simulationRun.deleteMany();
  await db.voteAttempt.deleteMany();
  await db.fanVote.deleteMany();
  await db.votingCode.deleteMany();
  await db.game.deleteMany();
  await db.lineup.deleteMany();
  await db.matchup.deleteMany();
  await db.user.deleteMany();
  await db.pair.deleteMany();
  await db.divisionPlayer.deleteMany();
  await db.player.deleteMany();
  await db.team.deleteMany();
  await db.group.deleteMany();
  await db.division.deleteMany();
  await db.tournament.deleteMany();

  const tournament = await db.tournament.create({
    data: {
      name: "MPW Dink and Dash Pickleball Tournament",
      slug: "mpw-pickleball-championship",
      season: "2026",
      simulationMode: true,
      destructiveToolsEnabled: process.env.NODE_ENV !== "production",
    },
  });

  const open = await db.division.create({
    data: {
      tournamentId: tournament.id,
      name: "Open Division",
      slug: "open",
      formatType: "GROUP_KNOCKOUT",
      entrantType: "TEAM",
      defaultGamesPerMatchup: 7,
      knockoutGamesPerMatchup: 5,
      qualifiersPerGroup: 1,
      wildcardCount: 1,
      autoProgression: true,
      thirdPlaceEnabled: true,
      suddenDeathAtTen: false,
      advancementRule: "Group winners plus the best remaining qualifier advance to the knockout stage.",
      guideNotes: "The organizer may still override any future matchup before scoring begins.",
      sortOrder: 0,
    },
  });
  const executiveMen = await db.division.create({
    data: {
      tournamentId: tournament.id,
      name: "Executive Men",
      slug: "executive-men",
      formatType: "CUSTOM",
      entrantType: "PLAYER",
      defaultGamesPerMatchup: 1,
      autoProgression: false,
      advancementRule: "Final format is confirmed after executive attendance is known.",
      guideNotes: "Candidates remain in the player pool until confirmed and assigned.",
      sortOrder: 10,
    },
  });
  const executiveWomen = await db.division.create({
    data: {
      tournamentId: tournament.id,
      name: "Executive Women",
      slug: "executive-women",
      formatType: "CUSTOM",
      entrantType: "PLAYER",
      defaultGamesPerMatchup: 1,
      autoProgression: false,
      advancementRule: "Final format is confirmed after executive attendance is known.",
      guideNotes: "Candidates remain in the player pool until confirmed and assigned.",
      sortOrder: 20,
    },
  });
  await db.division.create({
    data: {
      tournamentId: tournament.id,
      name: "Executive Mixed",
      slug: "executive-mixed",
      formatType: "CUSTOM",
      entrantType: "PAIR",
      defaultGamesPerMatchup: 1,
      autoProgression: false,
      advancementRule: "Final format is confirmed after executive attendance and pairings are known.",
      guideNotes: "Mixed pairs can be formed from confirmed Executive players.",
      sortOrder: 30,
    },
  });

  let leaderIndex = 1;
  for (const [groupIndex, groupName] of ["Group A", "Group B", "Group C"].entries()) {
    const group = await db.group.create({
      data: { name: groupName, slug: String.fromCharCode(97 + groupIndex), tournamentId: tournament.id, divisionId: open.id },
    });
    for (let teamIndex = 1; teamIndex <= 4; teamIndex += 1) {
      const teamNumber = groupIndex * 4 + teamIndex;
      const team = await db.team.create({
        data: { name: `Team ${teamNumber}`, shortName: `T${teamNumber}`, divisionId: open.id, groupId: group.id, groupPosition: teamIndex },
      });
      await db.user.create({
        data: {
          name: `${team.name} Leader`,
          email: `leader${leaderIndex}@mpw.test`,
          passwordHash: await bcrypt.hash("leader123", 10),
          role: "TEAM_LEADER",
          teamId: team.id,
        },
      });
      leaderIndex += 1;
    }
  }

  await db.player.createMany({
    data: readOfficialRoster().map((player) => ({
      firstName: player.firstName,
      middleInitial: player.middleInitial,
      lastName: player.lastName,
      displayName: player.displayName,
      employmentType: player.employmentType,
      sex: player.sex,
      office: player.office,
      tournamentId: tournament.id,
      teamId: null,
      participationStatus: "CONFIRMED",
      isActive: true,
    })),
  });

  await createGroupFixtures(db, tournament.id, open.id);
  await db.user.create({
    data: {
      name: "Tournament Admin",
      email: "admin@mpw.test",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "ADMIN",
    },
  });
  return tournament;
}
