ALTER TABLE "Division"
  ADD COLUMN "knockoutGamesPerMatchup" INTEGER,
  ADD COLUMN "thirdPlaceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "suddenDeathAtTen" BOOLEAN NOT NULL DEFAULT false;

-- Preserve current behavior until an organizer explicitly saves a different knockout count.
UPDATE "Division"
SET "knockoutGamesPerMatchup" = "defaultGamesPerMatchup"
WHERE "knockoutGamesPerMatchup" IS NULL;
