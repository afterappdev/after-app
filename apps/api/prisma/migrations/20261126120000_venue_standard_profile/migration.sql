-- CreateEnum
CREATE TYPE "VenueProfileKind" AS ENUM ('COMPLETE', 'STANDARD');
CREATE TYPE "StandardProfileStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "VenueClaimStatus" AS ENUM ('RECEIVED', 'REJECTED', 'INVITE_SENT', 'INVITE_EXPIRED', 'COMPLETED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "systemAccount" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "profileKind" "VenueProfileKind" NOT NULL DEFAULT 'COMPLETE';
ALTER TABLE "Venue" ADD COLUMN "standardProfileStatus" "StandardProfileStatus";
ALTER TABLE "Venue" ADD COLUMN "standardPublishedAt" TIMESTAMP(3);
ALTER TABLE "Venue" ADD COLUMN "standardUnpublishedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VenueClaim" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterRole" TEXT,
    "email" TEXT NOT NULL,
    "whatsapp" TEXT,
    "status" "VenueClaimStatus" NOT NULL DEFAULT 'RECEIVED',
    "reviewerAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "approvedEmail" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueClaim_pkey" PRIMARY KEY ("id")
);

-- Internal holder for standard venue profiles until claim completes.
INSERT INTO "User" (
    "id",
    "name",
    "email",
    "passwordHash",
    "role",
    "state",
    "city",
    "systemAccount",
    "accountStatus",
    "promoNotificationsEnabled",
    "sessionVersion",
    "createdAt",
    "updatedAt"
) VALUES (
    'after_standard_venue_owner',
    'After — perfis padrão',
    'after-standard-venues@internal.app-after.com.br',
    '$2a$10$after.standard.venues.no.login.placeholder.hash',
    'VENUE',
    'SP',
    'São Paulo',
    true,
    'ACTIVE',
    false,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT ("email") DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "VenueClaim_protocol_key" ON "VenueClaim"("protocol");
CREATE INDEX "VenueClaim_venueId_status_createdAt_idx" ON "VenueClaim"("venueId", "status", "createdAt");
CREATE INDEX "VenueClaim_status_createdAt_idx" ON "VenueClaim"("status", "createdAt");
CREATE INDEX "Venue_profileKind_standardProfileStatus_idx" ON "Venue"("profileKind", "standardProfileStatus");

-- AddForeignKey
ALTER TABLE "VenueClaim" ADD CONSTRAINT "VenueClaim_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VenueClaim" ADD CONSTRAINT "VenueClaim_reviewerAdminId_fkey" FOREIGN KEY ("reviewerAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;