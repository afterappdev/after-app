CREATE TYPE "AppStoreReviewEmailStatus" AS ENUM ('BASELINE', 'PENDING', 'SENT', 'FAILED');

CREATE TABLE "AppStoreReviewNotification" (
    "reviewId" TEXT NOT NULL,
    "appAppleId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "reviewerNickname" TEXT,
    "territory" TEXT,
    "reviewCreatedAt" TIMESTAMP(3) NOT NULL,
    "status" "AppStoreReviewEmailStatus" NOT NULL DEFAULT 'PENDING',
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailSentAt" TIMESTAMP(3),
    "lastEmailError" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppStoreReviewNotification_pkey" PRIMARY KEY ("reviewId")
);

CREATE INDEX "AppStoreReviewNotification_status_reviewCreatedAt_idx" ON "AppStoreReviewNotification"("status", "reviewCreatedAt");
CREATE INDEX "AppStoreReviewNotification_appAppleId_reviewCreatedAt_idx" ON "AppStoreReviewNotification"("appAppleId", "reviewCreatedAt");

CREATE TABLE "AppStoreReviewSyncState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "appAppleId" TEXT NOT NULL,
    "baselineCompletedAt" TIMESTAMP(3),
    "lastPollStartedAt" TIMESTAMP(3),
    "lastPollFinishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "nextScheduledPollAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppStoreReviewSyncState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppStoreReviewWorkerLock" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "lockedBy" TEXT NOT NULL,

    CONSTRAINT "AppStoreReviewWorkerLock_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AppStoreReviewWorkerLock" ("id", "lockedUntil", "lockedBy")
VALUES (1, TIMESTAMP '1970-01-01 00:00:00', 'init');