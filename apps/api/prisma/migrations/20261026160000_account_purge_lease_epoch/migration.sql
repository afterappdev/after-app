-- Monotonic fencing token: incremented on each successful claim.
ALTER TABLE "AccountPurgeJob" ADD COLUMN "leaseEpoch" INTEGER NOT NULL DEFAULT 0;
