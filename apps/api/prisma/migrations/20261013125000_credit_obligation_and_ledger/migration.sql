-- Inactive credit-debt tables. No backfill, no wallet update, no triggers.
-- Auxiliary UNIQUE constraints let composite foreign keys require the same venue.
-- id is already the primary key, so existing rows are unchanged.

ALTER TABLE "CreditPurchase" ADD CONSTRAINT "CreditPurchase_id_venueId_key" UNIQUE ("id", "venueId");
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_id_venueId_key" UNIQUE ("id", "venueId");
ALTER TABLE "CreditCouponRedemption" ADD CONSTRAINT "CreditCouponRedemption_id_venueId_key" UNIQUE ("id", "venueId");

CREATE TABLE "CreditObligation" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "creditsOriginal" INTEGER NOT NULL,
    "creditsRecovered" INTEGER NOT NULL,
    "creditsOpened" INTEGER NOT NULL,
    "creditsSettled" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditObligation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditObligation_purchaseId_key" ON "CreditObligation"("purchaseId");
ALTER TABLE "CreditObligation" ADD CONSTRAINT "CreditObligation_purchaseId_venueId_key" UNIQUE ("purchaseId", "venueId");
ALTER TABLE "CreditObligation" ADD CONSTRAINT "CreditObligation_id_venueId_key" UNIQUE ("id", "venueId");
CREATE INDEX "CreditObligation_venueId_status_createdAt_idx" ON "CreditObligation"("venueId", "status", "createdAt");

ALTER TABLE "CreditObligation" ADD CONSTRAINT "CreditObligation_credits_nonnegative_check" CHECK (
    "creditsOriginal" >= 0
    AND "creditsRecovered" >= 0
    AND "creditsOpened" >= 0
    AND "creditsSettled" >= 0
);

ALTER TABLE "CreditObligation" ADD CONSTRAINT "CreditObligation_credits_partition_check" CHECK (
    "creditsRecovered" + "creditsOpened" = "creditsOriginal"
);

ALTER TABLE "CreditObligation" ADD CONSTRAINT "CreditObligation_credits_settled_check" CHECK (
    "creditsSettled" <= "creditsOpened"
);

ALTER TABLE "CreditObligation" ADD CONSTRAINT "CreditObligation_status_check" CHECK (
    ("status" = 'open' AND "creditsSettled" < "creditsOpened")
    OR ("status" = 'settled' AND "creditsSettled" = "creditsOpened")
);

ALTER TABLE "CreditObligation" ADD CONSTRAINT "CreditObligation_source_check" CHECK (
    "source" IN ('pix_full_refund', 'card_full_refund')
);

ALTER TABLE "CreditObligation" ADD CONSTRAINT "CreditObligation_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditObligation" ADD CONSTRAINT "CreditObligation_purchaseId_venueId_fkey" FOREIGN KEY ("purchaseId", "venueId") REFERENCES "CreditPurchase"("id", "venueId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "purchaseId" TEXT,
    "obligationId" TEXT,
    "redemptionId" TEXT,
    "bannerId" TEXT,
    "credits" INTEGER NOT NULL,
    "availableDelta" INTEGER NOT NULL,
    "debtDelta" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditLedgerEntry_operationKey_key" ON "CreditLedgerEntry"("operationKey");
CREATE INDEX "CreditLedgerEntry_venueId_createdAt_idx" ON "CreditLedgerEntry"("venueId", "createdAt");

ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_operationKey_check" CHECK (
    char_length("operationKey") > 0
);

ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_kind_check" CHECK (
    char_length("kind") > 0
);

-- Optional links are RESTRICT so deleting the related row cannot clear venueId.
-- Prisma 5.22 cannot null only the optional id of a composite foreign key.
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_purchaseId_venueId_fkey" FOREIGN KEY ("purchaseId", "venueId") REFERENCES "CreditPurchase"("id", "venueId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_obligationId_venueId_fkey" FOREIGN KEY ("obligationId", "venueId") REFERENCES "CreditObligation"("id", "venueId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_redemptionId_venueId_fkey" FOREIGN KEY ("redemptionId", "venueId") REFERENCES "CreditCouponRedemption"("id", "venueId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_bannerId_venueId_fkey" FOREIGN KEY ("bannerId", "venueId") REFERENCES "Banner"("id", "venueId") ON DELETE RESTRICT ON UPDATE CASCADE;
