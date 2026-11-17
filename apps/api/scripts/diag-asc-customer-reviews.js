/**
 * Diagnóstico ASC customerReviews (somente leitura). Não imprime JWT nem .p8.
 */
require('dotenv').config();
require('ts-node/register/transpile-only');
const {
  probeAppStoreCustomerReviewsAccess,
  fetchAllAppStoreCustomerReviews,
} = require('../src/app-store-reviews/app-store-connect-reviews.client');
const {
  appStoreReviewAppleAppId,
} = require('../src/app-store-reviews/app-store-review.config');

async function main() {
  const appId = appStoreReviewAppleAppId();
  const probe = await probeAppStoreCustomerReviewsAccess(appId);
  if (!probe.ok) {
    console.log(JSON.stringify({ step: 'probe', ok: false, ...probe }));
    process.exit(1);
  }
  const full = await fetchAllAppStoreCustomerReviews(appId);
  if (!full.ok) {
    console.log(JSON.stringify({ step: 'fetch', ok: false, ...full }));
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      step: 'fetch',
      ok: true,
      appAppleId: appId,
      reviewCount: full.reviews.length,
      newest: full.reviews[0]
        ? {
            id: full.reviews[0].id,
            rating: full.reviews[0].rating,
            createdAt: full.reviews[0].createdAt.toISOString(),
          }
        : null,
    }),
  );
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});