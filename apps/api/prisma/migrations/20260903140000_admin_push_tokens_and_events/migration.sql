-- CreateEnum
CREATE TYPE "AdminPushEventType" AS ENUM ('ACCOUNT_CREATED', 'VENUE_CREATED', 'PURCHASE_PAID');

-- CreateTable
CREATE TABLE "AdminDeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminDeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPushEvent" (
    "id" TEXT NOT NULL,
    "type" "AdminPushEventType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "AdminPushEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminDeviceToken_token_key" ON "AdminDeviceToken"("token");

-- CreateIndex
CREATE INDEX "AdminDeviceToken_userId_idx" ON "AdminDeviceToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminPushEvent_type_entityId_key" ON "AdminPushEvent"("type", "entityId");

-- CreateIndex
CREATE INDEX "AdminPushEvent_createdAt_idx" ON "AdminPushEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminDeviceToken" ADD CONSTRAINT "AdminDeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
