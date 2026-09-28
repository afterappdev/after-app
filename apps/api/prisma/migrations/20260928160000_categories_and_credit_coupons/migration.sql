-- Venue.category strings are intentionally not rewritten.
-- App 1.0.1+11 stores and edits the previous labels. The next app
-- shows the new labels and the API keeps writing the 1.0.1+11 strings.
-- "Música ao Vivo" is left unchanged and is not remapped.

-- CreateTable
CREATE TABLE "CreditCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "creditAmount" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "maxRedemptionsPerVenue" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "venueId" TEXT,
    "venueNameSnapshot" TEXT NOT NULL,
    "venueCitySnapshot" TEXT,
    "creditAmount" INTEGER NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditCoupon_code_key" ON "CreditCoupon"("code");

-- CreateIndex
CREATE INDEX "CreditCoupon_active_expiresAt_idx" ON "CreditCoupon"("active", "expiresAt");

-- CreateIndex
CREATE INDEX "CreditCouponRedemption_couponId_redeemedAt_idx" ON "CreditCouponRedemption"("couponId", "redeemedAt");

-- CreateIndex
CREATE INDEX "CreditCouponRedemption_venueId_redeemedAt_idx" ON "CreditCouponRedemption"("venueId", "redeemedAt");

-- CreateIndex
CREATE INDEX "CreditCouponRedemption_couponId_venueId_idx" ON "CreditCouponRedemption"("couponId", "venueId");

-- AddForeignKey
ALTER TABLE "CreditCoupon" ADD CONSTRAINT "CreditCoupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCouponRedemption" ADD CONSTRAINT "CreditCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "CreditCoupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCouponRedemption" ADD CONSTRAINT "CreditCouponRedemption_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditCoupon" ADD CONSTRAINT "CreditCoupon_creditAmount_positive" CHECK ("creditAmount" > 0);
ALTER TABLE "CreditCoupon" ADD CONSTRAINT "CreditCoupon_maxRedemptions_positive" CHECK ("maxRedemptions" IS NULL OR "maxRedemptions" > 0);
ALTER TABLE "CreditCoupon" ADD CONSTRAINT "CreditCoupon_maxPerVenue_positive" CHECK ("maxRedemptionsPerVenue" > 0);
ALTER TABLE "CreditCoupon" ADD CONSTRAINT "CreditCoupon_window" CHECK ("startsAt" IS NULL OR "expiresAt" IS NULL OR "expiresAt" > "startsAt");
ALTER TABLE "CreditCouponRedemption" ADD CONSTRAINT "CreditCouponRedemption_creditAmount_positive" CHECK ("creditAmount" > 0);
