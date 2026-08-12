CREATE TYPE "DivisionEntrantType" AS ENUM ('TEAM', 'PLAYER', 'PAIR');

ALTER TABLE "Division"
  ADD COLUMN "entrantType" "DivisionEntrantType" NOT NULL DEFAULT 'TEAM';

ALTER TABLE "Team"
  ADD COLUMN "groupPosition" INTEGER;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "groupId"
      ORDER BY "shortName" ASC, "name" ASC, "id" ASC
    ) AS position
  FROM "Team"
  WHERE "groupId" IS NOT NULL
)
UPDATE "Team" t
SET "groupPosition" = ranked.position
FROM ranked
WHERE t."id" = ranked."id";

CREATE UNIQUE INDEX "Team_groupId_groupPosition_key" ON "Team"("groupId", "groupPosition");
