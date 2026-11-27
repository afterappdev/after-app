-- AlterTable
ALTER TABLE "VenueClaim" ADD COLUMN     "emailConfirmCodeHash" TEXT,
ADD COLUMN     "emailConfirmCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailConfirmAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);