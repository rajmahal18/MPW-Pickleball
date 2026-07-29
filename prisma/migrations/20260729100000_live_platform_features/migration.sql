-- Reviewed additive migration for live operations, simulation, voting, recovery, avatars, and MVP metadata.
CREATE TYPE "SexCategory" AS ENUM ('MALE', 'FEMALE');
CREATE TYPE "VotingCodeStatus" AS ENUM ('UNUSED', 'ISSUED', 'USED', 'REVOKED', 'REPLACED');
CREATE TYPE "SimulationStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'UNDONE', 'FAILED');
CREATE TYPE "CheckpointKind" AS ENUM ('MANUAL', 'AUTOMATIC');
ALTER TYPE "MatchupStatus" ADD VALUE IF NOT EXISTS 'FORFEITED';
ALTER TYPE "MatchupStatus" ADD VALUE IF NOT EXISTS 'INTERRUPTED';
ALTER TYPE "GameStatus" ADD VALUE IF NOT EXISTS 'FORFEITED';
ALTER TYPE "GameStatus" ADD VALUE IF NOT EXISTS 'INTERRUPTED';

ALTER TABLE "Tournament"
  ADD COLUMN "votingOpen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "votingDeadline" TIMESTAMP(3),
  ADD COLUMN "simulationMode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "destructiveToolsEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Tournament_isPublished_idx" ON "Tournament"("isPublished");

ALTER TABLE "Player"
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "sex" "SexCategory",
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
-- The original prototype had no sex field. Its seeded mixed pairs consistently stored
-- the first member as playerA and the second as playerB, so preserve that convention
-- for the upgrade. Review these inferred values before using real-event MVP rankings.
UPDATE "Player" p SET "sex" = 'MALE'::"SexCategory"
FROM "Pair" pair_row WHERE pair_row."playerAId" = p."id";
UPDATE "Player" p SET "sex" = 'FEMALE'::"SexCategory"
FROM "Pair" pair_row WHERE pair_row."playerBId" = p."id" AND p."sex" IS NULL;
UPDATE "Player" SET "sex" = 'MALE'::"SexCategory" WHERE "sex" IS NULL;
ALTER TABLE "Player" ALTER COLUMN "sex" SET NOT NULL;
CREATE INDEX "Player_teamId_sex_isActive_idx" ON "Player"("teamId", "sex", "isActive");

ALTER TABLE "Pair" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "Pair_teamId_isActive_idx" ON "Pair"("teamId", "isActive");
CREATE INDEX "Team_groupId_shortName_idx" ON "Team"("groupId", "shortName");

ALTER TABLE "Matchup"
  ADD COLUMN "roundNumber" INTEGER,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Matchup_tournamentId_status_scheduledAt_idx" ON "Matchup"("tournamentId", "status", "scheduledAt");
CREATE UNIQUE INDEX "Matchup_tournamentId_stage_order_key" ON "Matchup"("tournamentId", "stage", "order");

ALTER TABLE "Lineup" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Lineup" SET "updatedAt" = "submittedAt";
ALTER TABLE "Lineup" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Game" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Game_status_startedAt_idx" ON "Game"("status", "startedAt");

CREATE TABLE "ScoreEvent" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "actorId" TEXT,
  "simulationRunId" TEXT,
  "action" TEXT NOT NULL,
  "beforeState" JSONB NOT NULL,
  "afterState" JSONB NOT NULL,
  "reason" TEXT,
  "undoneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScoreEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VotingCode" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "codeHint" TEXT NOT NULL,
  "status" "VotingCodeStatus" NOT NULL DEFAULT 'UNUSED',
  "issuedAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "replacementReason" TEXT,
  "replacedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VotingCode_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FanVote" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "votingCodeId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FanVote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VoteAttempt" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "ipHash" TEXT NOT NULL,
  "codeHint" TEXT,
  "success" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoteAttempt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SimulationRun" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "createdById" TEXT,
  "kind" TEXT NOT NULL,
  "seed" TEXT,
  "status" "SimulationStatus" NOT NULL DEFAULT 'RUNNING',
  "options" JSONB,
  "result" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Checkpoint" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "CheckpointKind" NOT NULL DEFAULT 'MANUAL',
  "snapshot" JSONB NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "beforeState" JSONB,
  "afterState" JSONB,
  "reason" TEXT,
  "simulation" BOOLEAN NOT NULL DEFAULT false,
  "simulationRunId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScoreEvent_gameId_createdAt_idx" ON "ScoreEvent"("gameId", "createdAt");
CREATE INDEX "ScoreEvent_simulationRunId_idx" ON "ScoreEvent"("simulationRunId");
CREATE UNIQUE INDEX "VotingCode_codeHash_key" ON "VotingCode"("codeHash");
CREATE UNIQUE INDEX "VotingCode_replacedById_key" ON "VotingCode"("replacedById");
CREATE INDEX "VotingCode_tournamentId_status_idx" ON "VotingCode"("tournamentId", "status");
CREATE UNIQUE INDEX "FanVote_votingCodeId_key" ON "FanVote"("votingCodeId");
CREATE INDEX "FanVote_tournamentId_playerId_idx" ON "FanVote"("tournamentId", "playerId");
CREATE INDEX "VoteAttempt_tournamentId_ipHash_success_createdAt_idx" ON "VoteAttempt"("tournamentId", "ipHash", "success", "createdAt");
CREATE INDEX "SimulationRun_tournamentId_createdAt_idx" ON "SimulationRun"("tournamentId", "createdAt");
CREATE INDEX "SimulationRun_status_idx" ON "SimulationRun"("status");
CREATE INDEX "Checkpoint_tournamentId_createdAt_idx" ON "Checkpoint"("tournamentId", "createdAt");
CREATE INDEX "AuditLog_tournamentId_createdAt_idx" ON "AuditLog"("tournamentId", "createdAt");
CREATE INDEX "AuditLog_action_entityType_idx" ON "AuditLog"("action", "entityType");
CREATE INDEX "AuditLog_simulationRunId_idx" ON "AuditLog"("simulationRunId");

ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VotingCode" ADD CONSTRAINT "VotingCode_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VotingCode" ADD CONSTRAINT "VotingCode_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "VotingCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FanVote" ADD CONSTRAINT "FanVote_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FanVote" ADD CONSTRAINT "FanVote_votingCodeId_fkey" FOREIGN KEY ("votingCodeId") REFERENCES "VotingCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FanVote" ADD CONSTRAINT "FanVote_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoteAttempt" ADD CONSTRAINT "VoteAttempt_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimulationRun" ADD CONSTRAINT "SimulationRun_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimulationRun" ADD CONSTRAINT "SimulationRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_simulationRunId_fkey" FOREIGN KEY ("simulationRunId") REFERENCES "SimulationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_simulationRunId_fkey" FOREIGN KEY ("simulationRunId") REFERENCES "SimulationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
