import { PrismaClient } from "@prisma/client";
import { factorySeed } from "../lib/tournament/seed";

const prisma = new PrismaClient();

factorySeed(prisma as never)
  .then(async (tournament) => {
    const [divisionCount, teamCount, playerCount, pairCount, matchupCount] = await Promise.all([
      prisma.division.count({ where: { tournamentId: tournament.id } }),
      prisma.team.count({ where: { division: { tournamentId: tournament.id } } }),
      prisma.player.count({ where: { tournamentId: tournament.id } }),
      prisma.pair.count({ where: { team: { division: { tournamentId: tournament.id } } } }),
      prisma.matchup.count({ where: { tournamentId: tournament.id } }),
    ]);
    console.log(`Seeded ${tournament.name}: ${divisionCount} divisions, ${teamCount} teams, ${playerCount} players, ${pairCount} pairs, ${matchupCount} matchups.`);
  })
  .finally(() => prisma.$disconnect());
