-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "publicacaoAutorizada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Venue" ADD COLUMN "avisoCadastroEnviadoAt" TIMESTAMP(3);

-- Backfill: venues already "public" (not moderation-hidden) and complete get authorized
UPDATE "Venue"
SET "publicacaoAutorizada" = true
WHERE "moderationHiddenAt" IS NULL
  AND TRIM("name") <> ''
  AND LENGTH(TRIM("name")) >= 2
  AND "logoUrl" IS NOT NULL
  AND TRIM("logoUrl") <> ''
  AND ("contacts"->>'address') IS NOT NULL
  AND TRIM("contacts"->>'address') <> ''
  AND "hoursJson" IS NOT NULL
  AND "hoursJson"::text <> 'null'
  AND EXISTS (
    SELECT 1
    FROM jsonb_each(("hoursJson"::jsonb)) AS d(day_key, day_val)
    WHERE (day_val->>'closed') IS DISTINCT FROM 'true'
      AND day_val->>'open' IS NOT NULL
      AND TRIM(day_val->>'open') <> ''
      AND day_val->>'close' IS NOT NULL
      AND TRIM(day_val->>'close') <> ''
      AND (day_val->>'open') ~ '^([0-9]{1,2}):([0-9]{2})$'
      AND (day_val->>'close') ~ '^([0-9]{1,2}):([0-9]{2})$'
  );
