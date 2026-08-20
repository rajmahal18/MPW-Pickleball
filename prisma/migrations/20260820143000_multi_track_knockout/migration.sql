ALTER TABLE "Division"
ADD COLUMN "wildcardMode" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "wildcardBattleSize" INTEGER NOT NULL DEFAULT 8;

ALTER TABLE "Matchup"
ADD COLUMN "bracketTrack" TEXT NOT NULL DEFAULT 'CHAMPIONSHIP';

DROP INDEX "Matchup_divisionId_stage_order_key";
DROP INDEX IF EXISTS "Matchup_tournamentId_divisionId_stage_groupLabel_order_idx";

CREATE UNIQUE INDEX "Matchup_divisionId_bracketTrack_stage_order_key"
ON "Matchup"("divisionId", "bracketTrack", "stage", "order");

CREATE INDEX "Matchup_tournamentId_divisionId_bracketTrack_stage_groupLabel_order_idx"
ON "Matchup"("tournamentId", "divisionId", "bracketTrack", "stage", "groupLabel", "order");
