-- CreateEnum
CREATE TYPE "CreditCouponKind" AS ENUM ('CREDIT_GRANT', 'PURCHASE_DISCOUNT');

-- CreateEnum
CREATE TYPE "PurchaseDiscountType" AS ENUM ('PERCENT', 'FIXED_BRL');

-- AlterTable
ALTER TABLE "CreditCoupon" ADD COLUMN "kind" "CreditCouponKind" NOT NULL DEFAULT 'CREDIT_GRANT';
ALTER TABLE "CreditCoupon" ADD COLUMN "discountType" "PurchaseDiscountType";
ALTER TABLE "CreditCoupon" ADD COLUMN "discountPercent" INTEGER;
ALTER TABLE "CreditCoupon" ADD COLUMN "discountAmountBrl" DECIMAL(10,2);
ALTER TABLE "CreditCoupon" ALTER COLUMN "creditAmount" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CreditPurchase" ADD COLUMN "listPriceBrl" DECIMAL(10,2);
ALTER TABLE "CreditPurchase" ADD COLUMN "discountCouponId" TEXT;
ALTER TABLE "CreditPurchase" ADD COLUMN "discountCouponCode" TEXT;
ALTER TABLE "CreditPurchase" ADD COLUMN "discountAmountBrl" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "CreditCouponRedemption" ADD COLUMN "purchaseId" TEXT;
ALTER TABLE "CreditCouponRedemption" ADD COLUMN "discountAmountBrl" DECIMAL(10,2);
ALTER TABLE "CreditCouponRedemption" ALTER COLUMN "creditAmount" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CreditCouponRedemption_purchaseId_key" ON "CreditCouponRedemption"("purchaseId");

-- AddForeignKey
ALTER TABLE "CreditPurchase" ADD CONSTRAINT "CreditPurchase_discountCouponId_fkey" FOREIGN KEY ("discountCouponId") REFERENCES "CreditCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCouponRedemption" ADD CONSTRAINT "CreditCouponRedemption_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "CreditPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
