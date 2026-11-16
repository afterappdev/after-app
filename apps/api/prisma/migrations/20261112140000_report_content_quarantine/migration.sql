-- AlterEnum
ALTER TYPE "ReportModerationAction" ADD VALUE 'CONTENT_QUARANTINED';

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "moderationHiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VenuePhoto" ADD COLUMN "moderationHiddenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Review_moderationHiddenAt_idx" ON "Review"("moderationHiddenAt");

-- CreateIndex
CREATE INDEX "VenuePhoto_moderationHiddenAt_idx" ON "VenuePhoto"("moderationHiddenAt");
