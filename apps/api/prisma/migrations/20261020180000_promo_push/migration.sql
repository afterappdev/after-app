-- Additive promotional push. Existing rows keep working.
-- promoNotificationsEnabled defaults to false (opt-out) for every current user.
-- Reverse manually, in this order:
-- DROP TABLE "PromoPushDelivery";
-- DROP TABLE "PromoPushEvent";
-- DROP TABLE "DevicePushToken";
-- DROP TABLE "PromoPushWorkerLock";
-- DROP INDEX "BannerSchedule_ibgeCityId_displayDate_idx";
-- ALTER TABLE "BannerSchedule" DROP COLUMN "ibgeCityId";
-- ALTER TABLE "Banner" DROP COLUMN "contentKind";
-- DROP INDEX "Venue_ibgeCityId_idx";
-- ALTER TABLE "Venue" DROP COLUMN "ibgeCityId";
-- DROP INDEX "User_lastAuthorizedIbgeCityId_lastAuthorizedCityAt_idx";
-- DROP INDEX "User_promoNotificationsEnabled_ibgeCityId_idx";
-- DROP INDEX "User_ibgeCityId_idx";
-- ALTER TABLE "User" DROP COLUMN "lastAuthorizedCityAt";
-- ALTER TABLE "User" DROP COLUMN "lastAuthorizedIbgeCityId";
-- ALTER TABLE "User" DROP COLUMN "promoNotificationsEnabled";
-- ALTER TABLE "User" DROP COLUMN "ibgeCityId";
-- DROP TYPE "PromoPushDeliveryStatus";
-- DROP TYPE "PromoPushEventStatus";
-- DROP TYPE "BannerContentKind";

CREATE TYPE "BannerContentKind" AS ENUM ('PROMOTION', 'EVENT');

CREATE TYPE "PromoPushEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TYPE "PromoPushDeliveryStatus" AS ENUM ('CLAIMED', 'SENT', 'FAILED', 'INVALID', 'SKIPPED');

ALTER TABLE "User" ADD COLUMN "ibgeCityId" INTEGER;
ALTER TABLE "User" ADD COLUMN "promoNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lastAuthorizedIbgeCityId" INTEGER;
ALTER TABLE "User" ADD COLUMN "lastAuthorizedCityAt" TIMESTAMP(3);

ALTER TABLE "Venue" ADD COLUMN "ibgeCityId" INTEGER;

ALTER TABLE "Banner" ADD COLUMN "contentKind" "BannerContentKind";

ALTER TABLE "BannerSchedule" ADD COLUMN "ibgeCityId" INTEGER;

CREATE TABLE "DevicePushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromoPushEvent" (
    "id" TEXT NOT NULL,
    "bannerScheduleId" TEXT NOT NULL,
    "bannerId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "ibgeCityId" INTEGER NOT NULL,
    "displayDate" DATE NOT NULL,
    "contentKind" "BannerContentKind",
    "status" "PromoPushEventStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "targetedUsers" INTEGER NOT NULL DEFAULT 0,
    "targetedTokens" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoPushEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromoPushDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PromoPushDeliveryStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoPushDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromoPushWorkerLock" (
    "id" INTEGER NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "lockedBy" TEXT NOT NULL,

    CONSTRAINT "PromoPushWorkerLock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DevicePushToken_token_key" ON "DevicePushToken"("token");
CREATE INDEX "DevicePushToken_userId_disabledAt_idx" ON "DevicePushToken"("userId", "disabledAt");

CREATE UNIQUE INDEX "PromoPushEvent_bannerScheduleId_key" ON "PromoPushEvent"("bannerScheduleId");
CREATE INDEX "PromoPushEvent_status_availableAt_idx" ON "PromoPushEvent"("status", "availableAt");
CREATE INDEX "PromoPushEvent_expiresAt_status_idx" ON "PromoPushEvent"("expiresAt", "status");
CREATE INDEX "PromoPushEvent_bannerId_status_idx" ON "PromoPushEvent"("bannerId", "status");

CREATE UNIQUE INDEX "PromoPushDelivery_eventId_tokenId_key" ON "PromoPushDelivery"("eventId", "tokenId");
CREATE INDEX "PromoPushDelivery_userId_status_sentAt_idx" ON "PromoPushDelivery"("userId", "status", "sentAt");
CREATE INDEX "PromoPushDelivery_eventId_status_idx" ON "PromoPushDelivery"("eventId", "status");

CREATE INDEX "User_ibgeCityId_idx" ON "User"("ibgeCityId");
CREATE INDEX "User_promoNotificationsEnabled_ibgeCityId_idx" ON "User"("promoNotificationsEnabled", "ibgeCityId");
CREATE INDEX "User_lastAuthorizedIbgeCityId_lastAuthorizedCityAt_idx" ON "User"("lastAuthorizedIbgeCityId", "lastAuthorizedCityAt");
CREATE INDEX "Venue_ibgeCityId_idx" ON "Venue"("ibgeCityId");
CREATE INDEX "BannerSchedule_ibgeCityId_displayDate_idx" ON "BannerSchedule"("ibgeCityId", "displayDate");

ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoPushEvent" ADD CONSTRAINT "PromoPushEvent_bannerScheduleId_fkey" FOREIGN KEY ("bannerScheduleId") REFERENCES "BannerSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoPushDelivery" ADD CONSTRAINT "PromoPushDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PromoPushEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoPushDelivery" ADD CONSTRAINT "PromoPushDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
