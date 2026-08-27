-- AlterEnum
ALTER TYPE "PurchaseStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "CreditPurchase" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'BRL',
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "provider" TEXT;
