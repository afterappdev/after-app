-- CreateEnum
CREATE TYPE "AccountDeletionSource" AS ENUM ('SELF_SERVICE', 'ADMIN');

-- CreateTable
CREATE TABLE "AccountDeletionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "venueNameSnapshot" TEXT,
    "source" "AccountDeletionSource" NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDeletionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountDeletionLog_deletedAt_idx" ON "AccountDeletionLog"("deletedAt");

-- CreateIndex
CREATE INDEX "AccountDeletionLog_email_idx" ON "AccountDeletionLog"("email");

-- CreateIndex
CREATE INDEX "AccountDeletionLog_role_idx" ON "AccountDeletionLog"("role");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_usedAt_expiresAt_idx" ON "AccountDeletionRequest"("usedAt", "expiresAt");
