-- Phase G: purge progress tracking and terminal account state (no auto-run in this phase).
ALTER TYPE "AccountLifecycleStatus" ADD VALUE 'PURGED';

ALTER TABLE "AccountPurgeJob" ADD COLUMN "progressStage" TEXT;
ALTER TABLE "AccountPurgeJob" ADD COLUMN "uploadManifest" JSONB;
