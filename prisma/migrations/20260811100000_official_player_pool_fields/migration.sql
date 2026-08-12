CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'JOB_ORDER');

ALTER TABLE "Player"
  ADD COLUMN "middleInitial" TEXT,
  ADD COLUMN "employmentType" "EmploymentType",
  ADD COLUMN "office" TEXT;
