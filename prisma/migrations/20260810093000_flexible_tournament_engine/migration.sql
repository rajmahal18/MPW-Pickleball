-- Flexible tournament engine: divisions, player pool, optional team assignment,
-- configurable games per matchup, and additional tournament stages.

CREATE TYPE "DivisionFormat" AS ENUM ('GROUP_KNOCKOUT', 'ROUND_ROBIN', 'SINGLE_ELIMINATION', 'CUSTOM');
CREATE TYPE "PlayerParticipationStatus" AS ENUM ('POOL', 'CONFIRMED', 'UNAVAILABLE', 'WITHDRAWN');
CREATE TYPE "DivisionPlayerStatus" AS ENUM ('ELIGIBLE', 'CONFIRMED', 'UNAVAILABLE', 'WITHDRAWN');

ALTER TYPE "MatchupStage" ADD VALUE IF NOT EXISTS 'ROUND_ROBIN';
ALTER TYPE "MatchupStage" ADD VALUE IF NOT EXISTS 'QUARTERFINAL';
ALTER TYPE "MatchupStage" ADD VALUE IF NOT EXISTS 'THIRD_PLACE';
ALTER TYPE "MatchupStage" ADD VALUE IF NOT EXISTS 'CUSTOM';

CREATE TABLE "Division" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "formatType" "DivisionFormat" NOT NULL DEFAULT 'CUSTOM',
  "defaultGamesPerMatchup" INTEGER NOT NULL DEFAULT 1,
  "qualifiersPerGroup" INTEGER NOT NULL DEFAULT 1,
  "wildcardCount" INTEGER NOT NULL DEFAULT 0,
  "autoProgression" BOOLEAN NOT NULL DEFAULT false,
  "advancementRule" TEXT,
  "guideNotes" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Division_tournamentId_slug_key" ON "Division"("tournamentId", "slug");
CREATE INDEX "Division_tournamentId_sortOrder_idx" ON "Division"("tournamentId", "sortOrder");
ALTER TABLE "Division" ADD CONSTRAINT "Division_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing tournament is migrated into a default Open division without deleting data.
INSERT INTO "Division" (
  "id", "tournamentId", "name", "slug", "formatType", "defaultGamesPerMatchup",
  "qualifiersPerGroup", "wildcardCount", "autoProgression", "advancementRule", "guideNotes",
  "isPublic", "sortOrder", "updatedAt"
)
SELECT
  'legacy-open-' || "id", "id", 'Open Division', 'open', 'GROUP_KNOCKOUT', 7,
  1, 1, true,
  'Group winners plus the strongest remaining qualifier advance to the knockout stage.',
  'Existing 2026 Open tournament data migrated automatically.',
  true, 0, CURRENT_TIMESTAMP
FROM "Tournament";

-- Seed empty Executive divisions so the existing production tournament is immediately ready
-- for attendance-first executive brackets after this migration.
INSERT INTO "Division" (
  "id", "tournamentId", "name", "slug", "formatType", "defaultGamesPerMatchup",
  "qualifiersPerGroup", "wildcardCount", "autoProgression", "advancementRule", "guideNotes",
  "isPublic", "sortOrder", "updatedAt"
)
SELECT
  'legacy-exec-men-' || "id", "id", 'Executive Men', 'executive-men', 'CUSTOM', 1,
  0, 0, false,
  'Final format is confirmed after executive attendance is known.',
  'Keep candidates in the player pool until they are confirmed and assigned.',
  true, 10, CURRENT_TIMESTAMP
FROM "Tournament";

INSERT INTO "Division" (
  "id", "tournamentId", "name", "slug", "formatType", "defaultGamesPerMatchup",
  "qualifiersPerGroup", "wildcardCount", "autoProgression", "advancementRule", "guideNotes",
  "isPublic", "sortOrder", "updatedAt"
)
SELECT
  'legacy-exec-women-' || "id", "id", 'Executive Women', 'executive-women', 'CUSTOM', 1,
  0, 0, false,
  'Final format is confirmed after executive attendance is known.',
  'Keep candidates in the player pool until they are confirmed and assigned.',
  true, 20, CURRENT_TIMESTAMP
FROM "Tournament";

ALTER TABLE "Group" ADD COLUMN "divisionId" TEXT;
UPDATE "Group" SET "divisionId" = 'legacy-open-' || "tournamentId";
ALTER TABLE "Group" ALTER COLUMN "divisionId" SET NOT NULL;
CREATE INDEX "Group_divisionId_idx" ON "Group"("divisionId");
ALTER TABLE "Group" ADD CONSTRAINT "Group_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Team" ADD COLUMN "divisionId" TEXT;
UPDATE "Team" t SET "divisionId" = g."divisionId" FROM "Group" g WHERE t."groupId" = g."id";
ALTER TABLE "Team" ALTER COLUMN "divisionId" SET NOT NULL;
ALTER TABLE "Team" ALTER COLUMN "groupId" DROP NOT NULL;
ALTER TABLE "Team" DROP CONSTRAINT "Team_groupId_fkey";
ALTER TABLE "Team" ADD CONSTRAINT "Team_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX IF EXISTS "Team_groupId_name_key";
DROP INDEX IF EXISTS "Team_groupId_shortName_idx";
CREATE INDEX "Team_divisionId_name_idx" ON "Team"("divisionId", "name");
CREATE INDEX "Team_divisionId_groupId_shortName_idx" ON "Team"("divisionId", "groupId", "shortName");

ALTER TABLE "Player" ADD COLUMN "tournamentId" TEXT;
ALTER TABLE "Player" ADD COLUMN "participationStatus" "PlayerParticipationStatus" NOT NULL DEFAULT 'POOL';
UPDATE "Player" p
SET "tournamentId" = d."tournamentId", "participationStatus" = 'CONFIRMED'
FROM "Team" t
JOIN "Division" d ON d."id" = t."divisionId"
WHERE p."teamId" = t."id";
ALTER TABLE "Player" ALTER COLUMN "tournamentId" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "teamId" DROP NOT NULL;
ALTER TABLE "Player" DROP CONSTRAINT "Player_teamId_fkey";
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Player" ADD CONSTRAINT "Player_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX IF EXISTS "Player_teamId_firstName_lastName_key";
DROP INDEX IF EXISTS "Player_teamId_sex_isActive_idx";
CREATE INDEX "Player_tournamentId_participationStatus_isActive_idx" ON "Player"("tournamentId", "participationStatus", "isActive");
CREATE INDEX "Player_teamId_sex_isActive_idx" ON "Player"("teamId", "sex", "isActive");

CREATE TABLE "DivisionPlayer" (
  "id" TEXT NOT NULL,
  "divisionId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "status" "DivisionPlayerStatus" NOT NULL DEFAULT 'ELIGIBLE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DivisionPlayer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DivisionPlayer_divisionId_playerId_key" ON "DivisionPlayer"("divisionId", "playerId");
CREATE INDEX "DivisionPlayer_playerId_status_idx" ON "DivisionPlayer"("playerId", "status");
ALTER TABLE "DivisionPlayer" ADD CONSTRAINT "DivisionPlayer_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DivisionPlayer" ADD CONSTRAINT "DivisionPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DivisionPlayer" ("id", "divisionId", "playerId", "status", "updatedAt")
SELECT 'legacy-entry-' || p."id", t."divisionId", p."id", 'CONFIRMED', CURRENT_TIMESTAMP
FROM "Player" p
JOIN "Team" t ON t."id" = p."teamId";

ALTER TABLE "Matchup" ADD COLUMN "divisionId" TEXT;
ALTER TABLE "Matchup" ADD COLUMN "gamesPerMatchup" INTEGER NOT NULL DEFAULT 7;
UPDATE "Matchup" SET "divisionId" = 'legacy-open-' || "tournamentId";
ALTER TABLE "Matchup" ALTER COLUMN "divisionId" SET NOT NULL;
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX IF EXISTS "Matchup_tournamentId_stage_order_key";
DROP INDEX IF EXISTS "Matchup_tournamentId_stage_groupLabel_order_idx";
CREATE UNIQUE INDEX "Matchup_divisionId_stage_order_key" ON "Matchup"("divisionId", "stage", "order");
CREATE INDEX "Matchup_tournamentId_divisionId_stage_groupLabel_order_idx" ON "Matchup"("tournamentId", "divisionId", "stage", "groupLabel", "order");

-- Existing matchups keep 7 from the backfill; new matchups use the flexible schema default.
ALTER TABLE "Matchup" ALTER COLUMN "gamesPerMatchup" SET DEFAULT 1;
