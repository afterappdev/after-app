-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "ownerArchivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Venue_ownerArchivedAt_idx" ON "Venue"("ownerArchivedAt");
