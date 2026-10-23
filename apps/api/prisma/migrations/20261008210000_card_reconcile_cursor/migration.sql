-- AlterTable
ALTER TABLE "CardReconcileLock" ADD COLUMN "cursorConfirmedAt" TIMESTAMP(3),
ADD COLUMN "cursorPurchaseId" TEXT;
