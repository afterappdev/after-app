-- Provisional welcome proof for venues created without CPF/CNPJ.
-- Does not backfill or change existing wallets or purchases.

CREATE TABLE "WelcomeCreditVenueProvision" (
    "venueId" TEXT NOT NULL,
    "creditsGranted" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WelcomeCreditVenueProvision_pkey" PRIMARY KEY ("venueId"),
    CONSTRAINT "WelcomeCreditVenueProvision_creditsGranted_check" CHECK ("creditsGranted" = 1)
);

ALTER TABLE "WelcomeCreditVenueProvision" ADD CONSTRAINT "WelcomeCreditVenueProvision_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
