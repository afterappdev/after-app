-- Nullable venue CPF/CNPJ. Existing rows stay null and can still sign in.
-- Digits only. The unique pair rejects the same document on two venues,
-- including values that differed only by punctuation before normalization.

CREATE TYPE "VenueDocumentType" AS ENUM ('CPF', 'CNPJ');

ALTER TABLE "Venue" ADD COLUMN "documentType" "VenueDocumentType";
ALTER TABLE "Venue" ADD COLUMN "documentDigits" TEXT;

CREATE UNIQUE INDEX "Venue_documentType_documentDigits_key"
  ON "Venue"("documentType", "documentDigits");
