-- CreateEnum
CREATE TYPE "CouponCreditKind" AS ENUM ('COMMON', 'VIP');

-- AlterTable
ALTER TABLE "CreditCoupon" ADD COLUMN "creditKind" "CouponCreditKind" NOT NULL DEFAULT 'COMMON';

-- AlterTable
ALTER TABLE "CreditCouponRedemption" ADD COLUMN "creditKind" "CouponCreditKind" NOT NULL DEFAULT 'COMMON';
