-- Organizer-controlled quarterfinal qualification sources and optional champion team photo.
-- Additive only: existing bracket assignments and tournament data are preserved.
ALTER TABLE "Division"
  ADD COLUMN "championImageUrl" TEXT,
  ADD COLUMN "championImageTeamId" TEXT;

ALTER TABLE "Matchup"
  ADD COLUMN "homeQualificationSource" TEXT,
  ADD COLUMN "awayQualificationSource" TEXT;
