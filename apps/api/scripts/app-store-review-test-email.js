/**
 * Envia e-mail de teste do monitor de avaliações App Store.
 * Destino: APP_STORE_REVIEW_NOTIFY_TO ou desenvolvimento.after@gmail.com
 */
require('dotenv').config();
require('ts-node/register/transpile-only');
const {
  sendAppStoreReviewTestEmail,
} = require('../src/app-store-reviews/app-store-review-mail');
const {
  appStoreReviewAppleAppId,
  appStoreReviewNotifyTo,
} = require('../src/app-store-reviews/app-store-review.config');

async function main() {
  const to = appStoreReviewNotifyTo();
  const appAppleId = appStoreReviewAppleAppId();
  const result = await sendAppStoreReviewTestEmail(to, appAppleId);
  console.log(
    JSON.stringify({
      step: 'test_email',
      to,
      appAppleId,
      ...result,
    }),
  );
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});