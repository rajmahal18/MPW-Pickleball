import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";

const firstNames = ["Ainah", "Yasser", "Erap", "Yasmin", "Rafi", "Nadia", "Omar", "Lina", "Khalid", "Mina", "Sami", "Hana", "Zayd", "Mariam"];
const fixtures = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]] as const;

export async function clearTournamentActivity(db: Prisma.TransactionClient, tournamentId: string) {
  await db.scoreEvent.deleteMany({ where: { game: { matchup: { tournamentId } } } });
  await db.game.deleteMany({ where: { matchup: { tournamentId } } });
  await db.lineup.deleteMany({ where: { matchup: { tournamentId } } });
  await db.matchup.deleteMany({ where: { tournamentId } });
  await db.fanVote.deleteMany({ where: { tournamentId } });
  await db.votingCode.deleteMany({ where: { tournamentId } });
  await db.voteAttempt.deleteMany({ where: { tournamentId } });
}

export async function createGroupFixtures(db: Prisma.TransactionClient, tournamentId: string) {
  const groups = await db.group.findMany({
    where: { tournamentId },
    include: { teams: { orderBy: { shortName: "asc" } } },
    orderBy: { name: "asc" },
  });
  for (const [groupIndex, group] of groups.entries()) {
    if (group.teams.length !== 4) throw new Error(`${group.name} must contain exactly four teams.`);
    for (const [fixtureIndex, [homeIndex, awayIndex]] of fixtures.entries()) {
      await db.matchup.create({
        data: {
          tournamentId,
          stage: "GROUP",
          groupLabel: group.name,
          roundLabel: `Round ${fixtureIndex + 1}`,
          roundNumber: fixtureIndex + 1,
          order: groupIndex * 10 + fixtureIndex + 1,
          homeTeamId: group.teams[homeIndex]!.id,
          awayTeamId: group.teams[awayIndex]!.id,
          status: "LINEUP_PENDING",
          courtLabel: String((fixtureIndex % 2) + 1),
        },
      });
    }
  }
}

export async function rebuildActivityPreservingMasterData(db: Prisma.TransactionClient, tournamentId: string) {
  await clearTournamentActivity(db, tournamentId);
  await db.tournament.update({
    where: { id: tournamentId },
    data: { votingOpen: false, votingDeadline: null, simulationMode: true },
  });
  await createGroupFixtures(db, tournamentId);
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
  await db.player.deleteMany();
  await db.team.deleteMany();
  await db.group.deleteMany();
  await db.tournament.deleteMany();

  const tournament = await db.tournament.create({
    data: {
      name: "MPW Team Pickleball Championship",
      slug: "mpw-pickleball-championship",
      season: "2026",
      simulationMode: true,
      destructiveToolsEnabled: process.env.NODE_ENV !== "production",
    },
  });
  let leaderIndex = 1;
  for (const [groupIndex, groupName] of ["Group A", "Group B", "Group C"].entries()) {
    const group = await db.group.create({
      data: { name: groupName, slug: String.fromCharCode(97 + groupIndex), tournamentId: tournament.id },
    });
    for (let teamIndex = 1; teamIndex <= 4; teamIndex += 1) {
      const teamNumber = groupIndex * 4 + teamIndex;
      const team = await db.team.create({
        data: { name: `Team ${teamNumber}`, shortName: `T${teamNumber}`, groupId: group.id },
      });
      const players = [];
      for (let playerIndex = 0; playerIndex < 14; playerIndex += 1) {
        players.push(
          await db.player.create({
            data: {
              firstName: firstNames[playerIndex]!,
              lastName: `${team.shortName}-${playerIndex + 1}`,
              displayName: firstNames[playerIndex],
              sex: playerIndex % 2 === 0 ? "MALE" : "FEMALE",
              teamId: team.id,
            },
          }),
        );
      }
      for (let pairIndex = 0; pairIndex < 7; pairIndex += 1) {
        await db.pair.create({
          data: {
            label: `Pair ${pairIndex + 1}`,
            teamId: team.id,
            playerAId: players[pairIndex * 2]!.id,
            playerBId: players[pairIndex * 2 + 1]!.id,
          },
        });
      }
      await db.user.create({
        data: {
          name: `${team.name} Leader`,
          email: `leader${leaderIndex}@mpw.test`,
          passwordHash: await bcrypt.hash("leader123", 10),
          role: "TEAM_LEADER",
          teamId: team.id,
          playerId: players[0]!.id,
        },
      });
      leaderIndex += 1;
    }
  }
  await createGroupFixtures(db, tournament.id);
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
