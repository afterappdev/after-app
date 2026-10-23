-- One welcome credit per CPF or CNPJ. The row survives venue and account
-- deletion because originVenueId is not a foreign key.
-- Existing wallets, purchases and VIP balances are not changed.
-- No backfill: a past welcome purchase without a document cannot be linked.
-- Reverse manually:
-- DROP TABLE "WelcomeCreditClaim";

CREATE TABLE "WelcomeCreditClaim" (
    "id" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "documentType" "VenueDocumentType" NOT NULL,
    "creditsGranted" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originVenueId" TEXT,

    CONSTRAINT "WelcomeCreditClaim_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WelcomeCreditClaim_creditsGranted_check" CHECK ("creditsGranted" = 1)
);

CREATE UNIQUE INDEX "WelcomeCreditClaim_documentKey_key" ON "WelcomeCreditClaim"("documentKey");
