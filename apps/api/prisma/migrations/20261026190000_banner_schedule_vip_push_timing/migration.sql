-- CreateEnum
CREATE TYPE "VipPushTiming" AS ENUM ('IMMEDIATE', 'SLOT_11', 'SLOT_17');

-- AlterTable
ALTER TABLE "BannerSchedule" ADD COLUMN "vipPushTiming" "VipPushTiming";
