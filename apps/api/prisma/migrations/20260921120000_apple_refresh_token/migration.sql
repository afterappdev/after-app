-- Encrypted Apple refresh token + client_id for Sign in with Apple revocation.
-- Nullable so existing USER/VENUE rows keep working without a stored token.

ALTER TABLE "User" ADD COLUMN "appleRefreshTokenEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "appleClientId" TEXT;

ALTER TABLE "SocialOnboardingToken" ADD COLUMN "appleRefreshTokenEnc" TEXT;
ALTER TABLE "SocialOnboardingToken" ADD COLUMN "appleClientId" TEXT;
