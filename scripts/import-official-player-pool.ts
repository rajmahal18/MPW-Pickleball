import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type EmploymentType, type SexCategory } from "@prisma/client";

type CsvRow = Record<string, string>;

type RosterPlayer = {
  firstName: string;
  middleInitial: string | null;
  lastName: string;
  displayName: string | null;
  employmentType: EmploymentType;
  sex: SexCategory;
  office: string;
};

const EXPECTED_ROWS = 168;
const TOURNAMENT_SLUGS = ["mpw-pickleball-championship", "mpw-team-championship"];
const CSV_PATH = path.join(process.cwd(), "mpw_pickleball_official_player_pool.csv");

const prisma = new PrismaClient();

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
  if (!headers) throw new Error("CSV is empty.");
  return dataRows.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ""])));
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseLegacyName(fullName: string) {
  const parts = normalize(fullName).split(" ");
  if (parts.length < 2) throw new Error(`Cannot split displayName into firstName/lastName: ${fullName}`);

  const lastNameParts = [parts.pop()!];
  const suffix = lastNameParts[0]!;
  if (/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(suffix) && parts.length >= 2) {
    lastNameParts.unshift(parts.pop()!);
  }

  const maybeMiddle = parts.at(-1);
  const middleInitial = maybeMiddle && /^[A-Z]\.$/i.test(maybeMiddle) ? parts.pop()! : null;
  return { firstName: parts.join(" "), middleInitial, lastName: lastNameParts.join(" ") };
}

function toRosterPlayer(row: CsvRow): RosterPlayer {
  const hasStructuredName = "firstName" in row || "lastName" in row;
  const legacyName = normalize(row.displayName ?? "");
  const parsed = hasStructuredName
    ? {
        firstName: normalize(row.firstName ?? ""),
        middleInitial: normalize(row.middleInitial ?? "") || null,
        lastName: normalize(row.lastName ?? ""),
      }
    : parseLegacyName(legacyName);

  const displayName = hasStructuredName ? normalize(row.displayName ?? "") || null : null;
  const employmentType = normalize(row.employmentType ?? "");
  const sex = normalize(row.sexCategory ?? "");
  const office = normalize(row.office ?? "");

  if (!parsed.firstName) throw new Error(`Blank firstName for row: ${JSON.stringify(row)}`);
  if (!parsed.lastName) throw new Error(`Blank lastName for row: ${JSON.stringify(row)}`);
  if (parsed.middleInitial && !/^[A-Z]\.$/i.test(parsed.middleInitial)) throw new Error(`Invalid middleInitial: ${parsed.middleInitial}`);
  if (employmentType !== "PERMANENT" && employmentType !== "JOB_ORDER") throw new Error(`Invalid employmentType: ${employmentType}`);
  if (sex !== "MALE" && sex !== "FEMALE") throw new Error(`Invalid sexCategory: ${sex}`);
  if (!office) throw new Error(`Blank office for row: ${JSON.stringify(row)}`);

  return {
    ...parsed,
    displayName,
    employmentType,
    sex,
    office,
  };
}

function validateRoster(roster: RosterPlayer[]) {
  if (roster.length !== EXPECTED_ROWS) throw new Error(`Expected ${EXPECTED_ROWS} rows, found ${roster.length}.`);

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const player of roster) {
    const key = [player.firstName, player.middleInitial ?? "", player.lastName].join(" ").toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  if (duplicates.size) throw new Error(`Duplicate structured player names: ${Array.from(duplicates).join(", ")}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const roster = parseCsv(readFileSync(CSV_PATH, "utf8")).map(toRosterPlayer);
  validateRoster(roster);

  const tournament = await prisma.tournament.findFirst({
    where: { slug: { in: TOURNAMENT_SLUGS } },
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "desc" },
  });
  if (!tournament) {
    if (dryRun) {
      console.log(`Tournament not found. Checked slugs: ${TOURNAMENT_SLUGS.join(", ")}`);
      console.log("Current players: not checked");
      console.log(`Roster records to import: ${roster.length}`);
      console.log("Mode: dry-run");
      return;
    }
    throw new Error(`Tournament not found. Checked slugs: ${TOURNAMENT_SLUGS.join(", ")}`);
  }

  const currentPlayerCount = await prisma.player.count({ where: { tournamentId: tournament.id } });
  const currentPlayerIds = (await prisma.player.findMany({ where: { tournamentId: tournament.id }, select: { id: true } })).map((player) => player.id);
  const currentPairIds = currentPlayerIds.length
    ? (await prisma.pair.findMany({
        where: { OR: [{ playerAId: { in: currentPlayerIds } }, { playerBId: { in: currentPlayerIds } }] },
        select: { id: true },
      })).map((pair) => pair.id)
    : [];

  const protectedGames = currentPairIds.length
    ? await prisma.game.count({
        where: {
          OR: [{ homePairId: { in: currentPairIds } }, { awayPairId: { in: currentPairIds } }],
          AND: [{ OR: [{ status: { not: "SCHEDULED" } }, { homeScore: { not: 0 } }, { awayScore: { not: 0 } }] }],
        },
      })
    : 0;
  if (protectedGames) throw new Error("Roster replacement refused because existing players have recorded game history.");

  console.log(`Tournament: ${tournament.name} (${tournament.slug})`);
  console.log(`Current players: ${currentPlayerCount}`);
  console.log(`Roster records to import: ${roster.length}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "import"}`);

  if (dryRun) return;

  await prisma.$transaction(async (tx) => {
    await tx.fanVote.deleteMany({ where: { playerId: { in: currentPlayerIds } } });
    await tx.user.updateMany({ where: { playerId: { in: currentPlayerIds } }, data: { playerId: null } });
    await tx.lineupSlot.deleteMany({ where: { pairId: { in: currentPairIds } } });
    await tx.game.deleteMany({ where: { OR: [{ homePairId: { in: currentPairIds } }, { awayPairId: { in: currentPairIds } }] } });
    await tx.lineup.deleteMany({ where: { team: { division: { tournamentId: tournament.id } } } });
    await tx.pair.deleteMany({ where: { id: { in: currentPairIds } } });
    await tx.divisionPlayer.deleteMany({ where: { playerId: { in: currentPlayerIds } } });
    await tx.player.deleteMany({ where: { id: { in: currentPlayerIds } } });
    await tx.player.createMany({
      data: roster.map((player) => ({
        tournamentId: tournament.id,
        firstName: player.firstName,
        middleInitial: player.middleInitial,
        lastName: player.lastName,
        displayName: player.displayName,
        employmentType: player.employmentType,
        sex: player.sex,
        office: player.office,
        teamId: null,
        isActive: true,
        participationStatus: "CONFIRMED",
      })),
    });
  });

  const imported = await prisma.player.count({ where: { tournamentId: tournament.id, teamId: null, participationStatus: "CONFIRMED" } });
  console.log(`Imported confirmed unassigned players: ${imported}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
