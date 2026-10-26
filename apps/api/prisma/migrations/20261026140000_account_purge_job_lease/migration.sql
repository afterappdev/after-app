-- Phase F: per-job lease for account purge scheduler (no destructive purge in this phase).
ALTER TABLE "AccountPurgeJob" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "AccountPurgeJob" ADD COLUMN "lockedBy" TEXT;

CREATE INDEX "AccountPurgeJob_status_scheduledFor_lockedUntil_idx"
  ON "AccountPurgeJob"("status", "scheduledFor", "lockedUntil");
