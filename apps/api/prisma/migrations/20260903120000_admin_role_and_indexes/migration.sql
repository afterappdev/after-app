-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ADMIN';

-- CreateIndex
CREATE INDEX "User_role_createdAt_idx" ON "User"("role", "createdAt");

-- CreateIndex
CREATE INDEX "CreditPurchase_status_confirmedAt_idx" ON "CreditPurchase"("status", "confirmedAt");

-- CreateIndex
CREATE INDEX "CreditPurchase_provider_status_confirmedAt_idx" ON "CreditPurchase"("provider", "status", "confirmedAt");
