-- Multi-venue: one VENUE account may own many establishments.
-- Document uniqueness is enforced in application code (same owner may reuse CPF/CNPJ).

DROP INDEX IF EXISTS "Venue_ownerUserId_key";
DROP INDEX IF EXISTS "Venue_documentType_documentDigits_key";

ALTER TABLE "User" ADD COLUMN "activeVenueId" TEXT;

CREATE INDEX "Venue_ownerUserId_idx" ON "Venue"("ownerUserId");
CREATE INDEX "Venue_documentType_documentDigits_idx" ON "Venue"("documentType", "documentDigits");

ALTER TABLE "User" ADD CONSTRAINT "User_activeVenueId_fkey"
  FOREIGN KEY ("activeVenueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_activeVenueId_idx" ON "User"("activeVenueId");
