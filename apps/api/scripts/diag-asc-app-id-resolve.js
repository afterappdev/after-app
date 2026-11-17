require('dotenv').config();
require('ts-node/register/transpile-only');
const { createAppStoreConnectJwt } = require('../src/admin/store-metrics/app-store-connect-jwt');

(async () => {
  const jwt = createAppStoreConnectJwt();
  const appleId = process.env.APPLE_APP_APPLE_ID?.trim();
  const bundle = process.env.APPLE_BUNDLE_ID?.trim();
  if (!jwt) {
    console.log(JSON.stringify({ ok: false, reason: 'jwt' }));
    return;
  }
  const headers = { Authorization: `Bearer ${jwt}`, Accept: 'application/json' };
  const tries = [];
  if (appleId) {
    const direct = await fetch(
      `https://api.appstoreconnect.apple.com/v1/apps/${encodeURIComponent(appleId)}`,
      { headers },
    );
    tries.push({
      url: 'apps/{APPLE_APP_APPLE_ID}',
      status: direct.status,
      sample: (await direct.text()).slice(0, 300),
    });
    const reviews = await fetch(
      `https://api.appstoreconnect.apple.com/v1/apps/${encodeURIComponent(appleId)}/customerReviews?limit=1`,
      { headers },
    );
    tries.push({
      url: 'customerReviews via apple id',
      status: reviews.status,
      sample: (await reviews.text()).slice(0, 300),
    });
  }
  if (bundle) {
    const list = await fetch(
      `https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=${encodeURIComponent(bundle)}&limit=5`,
      { headers },
    );
    const text = await list.text();
    tries.push({
      url: 'apps?filter[bundleId]',
      status: list.status,
      sample: text.slice(0, 500),
    });
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const resourceId = json?.data?.[0]?.id;
    if (resourceId) {
      const reviews = await fetch(
        `https://api.appstoreconnect.apple.com/v1/apps/${encodeURIComponent(resourceId)}/customerReviews?limit=1`,
        { headers },
      );
      tries.push({
        url: 'customerReviews via resource id',
        resourceId,
        status: reviews.status,
        sample: (await reviews.text()).slice(0, 300),
      });
    }
  }
  console.log(JSON.stringify({ ok: true, tries }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});