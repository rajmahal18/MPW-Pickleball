-- Anonymous voter/session key for successful-vote cooldowns.
ALTER TABLE "VoteAttempt" ADD COLUMN "visitorKey" TEXT;

CREATE INDEX "VoteAttempt_tournamentId_visitorKey_success_createdAt_idx"
ON "VoteAttempt"("tournamentId", "visitorKey", "success", "createdAt");

-- Lightweight first-party public page analytics. No raw IP, full URL, or user identity is stored.
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrerHost" TEXT,
    "deviceType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageView_tournamentId_createdAt_idx"
ON "PageView"("tournamentId", "createdAt");

CREATE INDEX "PageView_tournamentId_path_createdAt_idx"
ON "PageView"("tournamentId", "path", "createdAt");

CREATE INDEX "PageView_tournamentId_visitorKey_createdAt_idx"
ON "PageView"("tournamentId", "visitorKey", "createdAt");

ALTER TABLE "PageView"
ADD CONSTRAINT "PageView_tournamentId_fkey"
FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
