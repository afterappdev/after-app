-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "promoPushEventId" TEXT;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_promoPushEventId_fkey" FOREIGN KEY ("promoPushEventId") REFERENCES "PromoPushEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_promoPushEventId_key" ON "Notification"("userId", "promoPushEventId");
