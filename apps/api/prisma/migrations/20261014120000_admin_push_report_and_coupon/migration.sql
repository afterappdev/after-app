-- Adds the admin push event values used by reports and confirmed coupon
-- redemptions. Existing rows are unchanged. No table is dropped or rewritten.
ALTER TYPE "AdminPushEventType" ADD VALUE IF NOT EXISTS 'REPORT_CREATED';
ALTER TYPE "AdminPushEventType" ADD VALUE 'COUPON_REDEEMED';
