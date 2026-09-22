-- AlterTable
ALTER TABLE "Report" ADD COLUMN "contentRestoredAt" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN "contentRestoredById" TEXT;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_contentRestoredById_fkey" FOREIGN KEY ("contentRestoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
