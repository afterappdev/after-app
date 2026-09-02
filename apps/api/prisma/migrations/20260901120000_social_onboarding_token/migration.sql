-- CreateTable
CREATE TABLE "SocialOnboardingToken" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialOnboardingToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialOnboardingToken_provider_providerId_idx" ON "SocialOnboardingToken"("provider", "providerId");

-- CreateIndex
CREATE INDEX "SocialOnboardingToken_expiresAt_idx" ON "SocialOnboardingToken"("expiresAt");
