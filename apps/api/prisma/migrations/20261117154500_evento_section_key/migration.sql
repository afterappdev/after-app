ALTER TABLE "EventoUserCheck" ADD COLUMN "sectionKey" TEXT NOT NULL DEFAULT 'after-day-1';

ALTER TABLE "EventoUserCheck" DROP CONSTRAINT "EventoUserCheck_pkey";

ALTER TABLE "EventoUserCheck" ADD CONSTRAINT "EventoUserCheck_pkey" PRIMARY KEY ("sectionKey", "userId");

CREATE INDEX "EventoUserCheck_sectionKey_updatedAt_idx" ON "EventoUserCheck"("sectionKey", "updatedAt");