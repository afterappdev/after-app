CREATE TABLE "CreditRefundAudit" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "creditsRecovered" INTEGER,
    "creditsUnrecovered" INTEGER,
    "originalAmount" DECIMAL(10,2),
    "refundedAmount" DECIMAL(10,2),
    "refundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditRefundAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditRefundAudit_purchaseId_kind_key" ON "CreditRefundAudit"("purchaseId", "kind");
CREATE INDEX "CreditRefundAudit_venueId_createdAt_idx" ON "CreditRefundAudit"("venueId", "createdAt");

ALTER TABLE "CreditRefundAudit" ADD CONSTRAINT "CreditRefundAudit_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "CreditPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditRefundAudit" ADD CONSTRAINT "CreditRefundAudit_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CardReconcileLock" (
    "id" INTEGER NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "lockedBy" TEXT NOT NULL,

    CONSTRAINT "CardReconcileLock_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CardReconcileLock" ("id", "lockedUntil", "lockedBy")
VALUES (1, TIMESTAMP '1970-01-01 00:00:00', '');
