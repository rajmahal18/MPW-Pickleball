CREATE TABLE "VotingCodeBatch" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "releaseAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VotingCodeBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VotingCode"
  ADD COLUMN "batchId" TEXT,
  ADD COLUMN "publicCode" TEXT;

CREATE INDEX "VotingCodeBatch_tournamentId_releaseAt_idx" ON "VotingCodeBatch"("tournamentId", "releaseAt");
CREATE INDEX "VotingCodeBatch_tournamentId_cancelledAt_idx" ON "VotingCodeBatch"("tournamentId", "cancelledAt");
CREATE INDEX "VotingCode_batchId_status_idx" ON "VotingCode"("batchId", "status");

ALTER TABLE "VotingCodeBatch"
  ADD CONSTRAINT "VotingCodeBatch_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VotingCode"
  ADD CONSTRAINT "VotingCode_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "VotingCodeBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
