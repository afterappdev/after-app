-- Nullable age band for common users. Existing rows stay null and can still sign in.
-- Venue rows are not backfilled and are not required to have a band.

CREATE TYPE "AgeBand" AS ENUM ('AGE_0_18', 'AGE_19_35', 'AGE_36_50', 'AGE_OVER_50');

ALTER TABLE "User" ADD COLUMN "ageBand" "AgeBand";
