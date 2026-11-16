-- New accounts start with promo notifications on.
-- Existing rows keep the value they already have.
ALTER TABLE "User" ALTER COLUMN "promoNotificationsEnabled" SET DEFAULT true;
