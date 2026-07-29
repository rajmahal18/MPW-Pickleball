-- Baseline migration for the original uploaded prototype schema.
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TEAM_LEADER');
CREATE TYPE "MatchupStage" AS ENUM ('GROUP', 'SEMIFINAL', 'FINAL');
CREATE TYPE "MatchupStatus" AS ENUM ('SCHEDULED', 'LINEUP_PENDING', 'READY', 'LIVE', 'COMPLETED');
CREATE TYPE "GameStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED');

CREATE TABLE "Tournament" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Group" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT NOT NULL,
  "logoUrl" TEXT,
  "groupId" TEXT NOT NULL,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Player" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Pair" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "playerAId" TEXT NOT NULL,
  "playerBId" TEXT NOT NULL,
  CONSTRAINT "Pair_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "teamId" TEXT,
  "playerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Matchup" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "stage" "MatchupStage" NOT NULL,
  "groupLabel" TEXT,
  "roundLabel" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "homeTeamId" TEXT,
  "awayTeamId" TEXT,
  "status" "MatchupStatus" NOT NULL DEFAULT 'LINEUP_PENDING',
  "scheduledAt" TIMESTAMP(3),
  "courtLabel" TEXT,
  "winnerTeamId" TEXT,
  "homeWins" INTEGER NOT NULL DEFAULT 0,
  "awayWins" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Matchup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Lineup" (
  "id" TEXT NOT NULL,
  "matchupId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lineup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LineupSlot" (
  "id" TEXT NOT NULL,
  "lineupId" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "pairId" TEXT NOT NULL,
  CONSTRAINT "LineupSlot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Game" (
  "id" TEXT NOT NULL,
  "matchupId" TEXT NOT NULL,
  "gameNumber" INTEGER NOT NULL,
  "homeTeamId" TEXT NOT NULL,
  "awayTeamId" TEXT NOT NULL,
  "homePairId" TEXT NOT NULL,
  "awayPairId" TEXT NOT NULL,
  "homeScore" INTEGER NOT NULL DEFAULT 0,
  "awayScore" INTEGER NOT NULL DEFAULT 0,
  "status" "GameStatus" NOT NULL DEFAULT 'SCHEDULED',
  "winnerTeamId" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");
CREATE UNIQUE INDEX "Group_tournamentId_slug_key" ON "Group"("tournamentId", "slug");
CREATE UNIQUE INDEX "Team_groupId_name_key" ON "Team"("groupId", "name");
CREATE UNIQUE INDEX "Player_teamId_firstName_lastName_key" ON "Player"("teamId", "firstName", "lastName");
CREATE UNIQUE INDEX "Pair_teamId_label_key" ON "Pair"("teamId", "label");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_playerId_key" ON "User"("playerId");
CREATE INDEX "Matchup_tournamentId_stage_groupLabel_order_idx" ON "Matchup"("tournamentId", "stage", "groupLabel", "order");
CREATE UNIQUE INDEX "Lineup_matchupId_teamId_key" ON "Lineup"("matchupId", "teamId");
CREATE UNIQUE INDEX "LineupSlot_lineupId_slot_key" ON "LineupSlot"("lineupId", "slot");
CREATE UNIQUE INDEX "LineupSlot_lineupId_pairId_key" ON "LineupSlot"("lineupId", "pairId");
CREATE UNIQUE INDEX "Game_matchupId_gameNumber_key" ON "Game"("matchupId", "gameNumber");

ALTER TABLE "Group" ADD CONSTRAINT "Group_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lineup" ADD CONSTRAINT "Lineup_matchupId_fkey" FOREIGN KEY ("matchupId") REFERENCES "Matchup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lineup" ADD CONSTRAINT "Lineup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineupSlot" ADD CONSTRAINT "LineupSlot_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "Lineup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineupSlot" ADD CONSTRAINT "LineupSlot_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "Pair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Game" ADD CONSTRAINT "Game_matchupId_fkey" FOREIGN KEY ("matchupId") REFERENCES "Matchup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Game" ADD CONSTRAINT "Game_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Game" ADD CONSTRAINT "Game_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Game" ADD CONSTRAINT "Game_homePairId_fkey" FOREIGN KEY ("homePairId") REFERENCES "Pair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Game" ADD CONSTRAINT "Game_awayPairId_fkey" FOREIGN KEY ("awayPairId") REFERENCES "Pair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
