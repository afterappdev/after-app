-- Historical welcome proof. Existing claim rows become SIGNUP.
-- Does not insert claims, does not read documents, and does not touch wallets.
-- Reverse manually:
-- ALTER TABLE "WelcomeCreditClaim" DROP CONSTRAINT "WelcomeCreditClaim_credits_source_check";
-- ALTER TABLE "WelcomeCreditClaim" DROP COLUMN "source";
-- ALTER TABLE "WelcomeCreditClaim" ADD CONSTRAINT "WelcomeCreditClaim_creditsGranted_check" CHECK ("creditsGranted" = 1);
-- DROP TYPE "WelcomeCreditSource";

CREATE TYPE "WelcomeCreditSource" AS ENUM ('SIGNUP', 'HISTORICAL');

ALTER TABLE "WelcomeCreditClaim"
  ADD COLUMN "source" "WelcomeCreditSource" NOT NULL DEFAULT 'SIGNUP';

ALTER TABLE "WelcomeCreditClaim" DROP CONSTRAINT "WelcomeCreditClaim_creditsGranted_check";

ALTER TABLE "WelcomeCreditClaim"
  ADD CONSTRAINT "WelcomeCreditClaim_credits_source_check"
  CHECK (
    ("source" = 'SIGNUP' AND "creditsGranted" = 1)
    OR ("source" = 'HISTORICAL' AND "creditsGranted" >= 1)
  );
