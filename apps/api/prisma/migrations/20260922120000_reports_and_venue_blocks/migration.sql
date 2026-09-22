-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('VENUE', 'BANNER', 'PHOTO', 'VIDEO', 'REVIEW');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('INAPPROPRIATE', 'SPAM', 'MISLEADING', 'VIOLENCE', 'SEXUAL', 'HATE', 'COPYRIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWING', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportModerationAction" AS ENUM ('NONE', 'CONTENT_REMOVED', 'VENUE_HIDDEN');

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "moderationHiddenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "targetSnapshot" JSONB,
    "moderationAction" "ReportModerationAction" NOT NULL DEFAULT 'NONE',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "activeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVenueBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserVenueBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Report_activeKey_key" ON "Report"("activeKey");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_reporterId_createdAt_idx" ON "Report"("reporterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserVenueBlock_userId_venueId_key" ON "UserVenueBlock"("userId", "venueId");

-- CreateIndex
CREATE INDEX "UserVenueBlock_venueId_idx" ON "UserVenueBlock"("venueId");

-- CreateIndex
CREATE INDEX "Venue_moderationHiddenAt_idx" ON "Venue"("moderationHiddenAt");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVenueBlock" ADD CONSTRAINT "UserVenueBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVenueBlock" ADD CONSTRAINT "UserVenueBlock_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
