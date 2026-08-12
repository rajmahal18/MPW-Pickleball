CREATE TABLE "GroupStandingOverride" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GroupStandingOverride_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GroupStandingOverride"
  ADD CONSTRAINT "GroupStandingOverride_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupStandingOverride"
  ADD CONSTRAINT "GroupStandingOverride_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "GroupStandingOverride_groupId_teamId_key" ON "GroupStandingOverride"("groupId", "teamId");
CREATE UNIQUE INDEX "GroupStandingOverride_groupId_position_key" ON "GroupStandingOverride"("groupId", "position");
CREATE INDEX "GroupStandingOverride_teamId_idx" ON "GroupStandingOverride"("teamId");
