-- Preserve existing access while introducing the three-role model.
CREATE TYPE "UserRole_new" AS ENUM ('SUPERADMIN', 'ADMIN', 'TEAM_MANAGER');
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING (
    CASE "role"::text
      WHEN 'ADMIN' THEN 'SUPERADMIN'
      WHEN 'TEAM_LEADER' THEN 'TEAM_MANAGER'
      ELSE 'TEAM_MANAGER'
    END
  )::"UserRole_new";
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";


-- Event sex category is explicit instead of inferred from names/slugs. Team Event remains open to both.
ALTER TABLE "Division" ADD COLUMN "sexCategory" "SexCategory";

-- Organizer choice is stored only for a legitimate tied MVP result.
CREATE TABLE "MvpSelection" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "divisionId" TEXT NOT NULL,
  "sexCategory" "SexCategory" NOT NULL,
  "playerId" TEXT NOT NULL,
  "selectedById" TEXT,
  "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MvpSelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MvpSelection_divisionId_sexCategory_key" ON "MvpSelection"("divisionId", "sexCategory");
CREATE INDEX "MvpSelection_tournamentId_divisionId_idx" ON "MvpSelection"("tournamentId", "divisionId");

ALTER TABLE "MvpSelection" ADD CONSTRAINT "MvpSelection_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MvpSelection" ADD CONSTRAINT "MvpSelection_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MvpSelection" ADD CONSTRAINT "MvpSelection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MvpSelection" ADD CONSTRAINT "MvpSelection_selectedById_fkey" FOREIGN KEY ("selectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Normalize the three event names/types created by the previous flexible-engine migration.
UPDATE "Division" SET "name" = 'Team Event', "slug" = 'team-event', "entrantType" = 'TEAM', "sexCategory" = NULL WHERE "slug" = 'open';
UPDATE "Division" SET "name" = 'Men''s Executive', "slug" = 'mens-executive', "entrantType" = 'PAIR', "sexCategory" = 'MALE', "defaultGamesPerMatchup" = 1, "knockoutGamesPerMatchup" = 1 WHERE "slug" = 'executive-men';
UPDATE "Division" SET "name" = 'Women''s Executive', "slug" = 'womens-executive', "entrantType" = 'PAIR', "sexCategory" = 'FEMALE', "defaultGamesPerMatchup" = 1, "knockoutGamesPerMatchup" = 1 WHERE "slug" = 'executive-women';
