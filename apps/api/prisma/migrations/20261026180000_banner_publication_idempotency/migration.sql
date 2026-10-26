-- CreateEnum
CREATE TYPE "BannerPublicationIdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED');

-- CreateTable
CREATE TABLE "BannerPublicationIdempotency" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "BannerPublicationIdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "bannerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BannerPublicationIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BannerPublicationIdempotency_venueId_idempotencyKey_key" ON "BannerPublicationIdempotency"("venueId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BannerPublicationIdempotency_bannerId_idx" ON "BannerPublicationIdempotency"("bannerId");

-- AddForeignKey
ALTER TABLE "BannerPublicationIdempotency" ADD CONSTRAINT "BannerPublicationIdempotency_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BannerPublicationIdempotency" ADD CONSTRAINT "BannerPublicationIdempotency_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "Banner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
