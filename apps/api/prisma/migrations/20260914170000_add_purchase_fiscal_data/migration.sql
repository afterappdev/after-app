-- AlterTable
ALTER TABLE "CreditPurchase" ADD COLUMN "invoiceRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CreditPurchase" ADD COLUMN "fiscalPersonType" TEXT;
ALTER TABLE "CreditPurchase" ADD COLUMN "fiscalName" TEXT;
ALTER TABLE "CreditPurchase" ADD COLUMN "fiscalDocument" TEXT;
ALTER TABLE "CreditPurchase" ADD COLUMN "fiscalEmail" TEXT;
