-- Soft delete phase A: lifecycle fields on User and purge job outbox.
-- No behavior change; existing users default to ACTIVE.
-- Does not touch payment or credit tables.
-- Reverse manually, in this order:
-- DROP TABLE "AccountPurgeJob";
-- DROP INDEX "User_accountStatus_permanentDeletionAt_idx";
-- ALTER TABLE "User" DROP COLUMN "sessionInvalidatedAt";
-- ALTER TABLE "User" DROP COLUMN "deletionCancelledAt";
-- ALTER TABLE "User" DROP COLUMN "deletionConfirmedAt";
-- ALTER TABLE "User" DROP COLUMN "permanentDeletionAt";
-- ALTER TABLE "User" DROP COLUMN "deletionRequestedAt";
-- ALTER TABLE "User" DROP COLUMN "accountStatus";
-- DROP TYPE "AccountPurgeJobStatus";
-- DROP TYPE "AccountLifecycleStatus";

CREATE TYPE "AccountLifecycleStatus" AS ENUM ('ACTIVE', 'PENDING_DELETION');

CREATE TYPE "AccountPurgeJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

ALTER TABLE "User" ADD COLUMN "accountStatus" "AccountLifecycleStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "permanentDeletionAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deletionConfirmedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deletionCancelledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "sessionInvalidatedAt" TIMESTAMP(3);

CREATE INDEX "User_accountStatus_permanentDeletionAt_idx" ON "User"("accountStatus", "permanentDeletionAt");

CREATE TABLE "AccountPurgeJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "AccountPurgeJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPurgeJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountPurgeJob_userId_key" ON "AccountPurgeJob"("userId");

CREATE INDEX "AccountPurgeJob_status_scheduledFor_idx" ON "AccountPurgeJob"("status", "scheduledFor");
