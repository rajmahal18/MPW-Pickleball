-- Allow one Fan Favorite ballot to include one male vote and one female vote.
ALTER TABLE "FanVote" ADD COLUMN "sexCategory" "SexCategory";

UPDATE "FanVote" fv
SET "sexCategory" = p."sex"
FROM "Player" p
WHERE fv."playerId" = p."id";

UPDATE "FanVote"
SET "sexCategory" = 'MALE'::"SexCategory"
WHERE "sexCategory" IS NULL;

ALTER TABLE "FanVote" ALTER COLUMN "sexCategory" SET NOT NULL;

DROP INDEX IF EXISTS "FanVote_votingCodeId_key";
CREATE UNIQUE INDEX "FanVote_votingCodeId_sexCategory_key" ON "FanVote"("votingCodeId", "sexCategory");
CREATE INDEX "FanVote_tournamentId_sexCategory_playerId_idx" ON "FanVote"("tournamentId", "sexCategory", "playerId");
