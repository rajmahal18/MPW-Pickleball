import { PrismaClient } from "@prisma/client";
import { factorySeed } from "../lib/tournament/seed";

const prisma = new PrismaClient();

async function main() {
  const tournament = await prisma.$transaction((tx) => factorySeed(tx), { timeout: 60_000 });
  console.log(`Seeded ${tournament.name}: 3 groups, 12 teams, 84 pairs, 168 players, and 18 group team matchups.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
