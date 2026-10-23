-- Additive VIP credits and two push slots per VIP day.
-- Existing wallet balances, banners, and schedules stay common.
-- Reverse manually, in this order:
-- ALTER TABLE "BannerSchedule" DROP CONSTRAINT "BannerSchedule_vipCreditEntryId_fkey";
-- DROP INDEX "PromoPushEvent_bannerScheduleId_slot_key";
-- CREATE UNIQUE INDEX "PromoPushEvent_bannerScheduleId_key" ON "PromoPushEvent"("bannerScheduleId");
-- ALTER TABLE "PromoPushEvent" DROP COLUMN "slot";
-- ALTER TABLE "BannerSchedule" DROP COLUMN "vipCreditEntryId";
-- ALTER TABLE "BannerSchedule" DROP COLUMN "tier";
-- ALTER TABLE "Banner" DROP COLUMN "vipCreditsCost";
-- DROP TABLE "VipCreditEntry";
-- ALTER TABLE "CreditWallet" DROP COLUMN "vipBalance";
-- DROP TYPE "PublicationTier";

CREATE TYPE "PublicationTier" AS ENUM ('COMMON', 'VIP');

ALTER TABLE "CreditWallet" ADD COLUMN "vipBalance" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Banner" ADD COLUMN "vipCreditsCost" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "BannerSchedule" ADD COLUMN "tier" "PublicationTier" NOT NULL DEFAULT 'COMMON';
ALTER TABLE "BannerSchedule" ADD COLUMN "vipCreditEntryId" TEXT;

CREATE TABLE "VipCreditEntry" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "balanceDelta" INTEGER NOT NULL,
    "bannerId" TEXT,
    "scheduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VipCreditEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VipCreditEntry_operationKey_key" ON "VipCreditEntry"("operationKey");
CREATE UNIQUE INDEX "VipCreditEntry_scheduleId_key" ON "VipCreditEntry"("scheduleId");
CREATE INDEX "VipCreditEntry_venueId_createdAt_idx" ON "VipCreditEntry"("venueId", "createdAt");

ALTER TABLE "VipCreditEntry" ADD CONSTRAINT "VipCreditEntry_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "BannerSchedule_vipCreditEntryId_key" ON "BannerSchedule"("vipCreditEntryId");
ALTER TABLE "BannerSchedule" ADD CONSTRAINT "BannerSchedule_vipCreditEntryId_fkey" FOREIGN KEY ("vipCreditEntryId") REFERENCES "VipCreditEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PromoPushEvent" ADD COLUMN "slot" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "PromoPushEvent_bannerScheduleId_key";
CREATE UNIQUE INDEX "PromoPushEvent_bannerScheduleId_slot_key" ON "PromoPushEvent"("bannerScheduleId", "slot");
