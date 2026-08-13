-- Tournament-day court queue and per-match lineup category restrictions.
CREATE TYPE "PairMatchCategory" AS ENUM ('MENS', 'WOMENS', 'MIXED');

ALTER TABLE "Tournament"
ADD COLUMN "activeCourtCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Division"
ADD COLUMN "groupMatchCategories" "PairMatchCategory"[] NOT NULL DEFAULT ARRAY[]::"PairMatchCategory"[],
ADD COLUMN "knockoutMatchCategories" "PairMatchCategory"[] NOT NULL DEFAULT ARRAY[]::"PairMatchCategory"[],
ADD COLUMN "groupCategoryRulesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "knockoutCategoryRulesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Seed the current MPW Team Event defaults when a division already uses the known 7/5 format.
UPDATE "Division"
SET "groupMatchCategories" = ARRAY['MENS','WOMENS','MENS','WOMENS','MENS','WOMENS','MIXED']::"PairMatchCategory"[]
WHERE "formatType" = 'GROUP_KNOCKOUT' AND "entrantType" = 'TEAM'
  AND "defaultGamesPerMatchup" = 7 AND cardinality("groupMatchCategories") = 0;

UPDATE "Division" SET "groupCategoryRulesEnabled" = true
WHERE "formatType" = 'GROUP_KNOCKOUT' AND "entrantType" = 'TEAM' AND "defaultGamesPerMatchup" = 7;

UPDATE "Division"
SET "knockoutMatchCategories" = ARRAY['MENS','WOMENS','MIXED','WOMENS','MENS']::"PairMatchCategory"[]
WHERE "formatType" = 'GROUP_KNOCKOUT' AND "entrantType" = 'TEAM'
  AND COALESCE("knockoutGamesPerMatchup", "defaultGamesPerMatchup") = 5 AND cardinality("knockoutMatchCategories") = 0;

UPDATE "Division" SET "knockoutCategoryRulesEnabled" = true
WHERE "formatType" = 'GROUP_KNOCKOUT' AND "entrantType" = 'TEAM'
  AND COALESCE("knockoutGamesPerMatchup", "defaultGamesPerMatchup") = 5;

ALTER TABLE "Matchup"
ADD COLUMN "queuePosition" INTEGER;

CREATE INDEX "Matchup_tournamentId_queuePosition_idx" ON "Matchup"("tournamentId", "queuePosition");
