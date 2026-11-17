/**
 * Compara GET minimal vs URL do job. Sem JWT/.p8 na saída.
 * Uso Railway: railway run node scripts/diag-asc-customer-reviews-compare.js
 * Chave Admin local:
 *   node scripts/diag-asc-customer-reviews-compare.js ^
 *     --issuer <uuid> --key-id <id> --p8 C:\caminho\AuthKey_XXX.p8
 */
const { existsSync, readFileSync } = require('fs');
const { resolve } = require('path');
require('dotenv').config();
require('ts-node/register/transpile-only');

const {
  appStoreReviewAscMinimalUrl,
  appStoreReviewAscListUrl,
  appStoreReviewAscStartUrlCandidates,
  appStoreReviewAppleAppId,
} = require('../src/app-store-reviews/app-store-review.config');
const { appStoreReviewAscCredentialSource } = require('../src/app-store-reviews/app-store-review-connect-jwt');
const {
  fetchAscCustomerReviewsPageDiag,
} = require('../src/app-store-reviews/app-store-connect-reviews.client');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--issuer' && argv[i + 1]) out.issuer = argv[++i].trim();
    else if (a === '--key-id' && argv[i + 1]) out.keyId = argv[++i].trim();
    else if (a === '--p8' && argv[i + 1]) out.p8Path = resolve(argv[++i]);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function applyCliAsc(env, args) {
  if (!args.issuer || !args.keyId || !args.p8Path || !existsSync(args.p8Path)) {
    return env;
  }
  const copy = { ...env };
  copy.APP_STORE_REVIEW_CONNECT_ISSUER_ID = args.issuer;
  copy.APP_STORE_REVIEW_CONNECT_KEY_ID = args.keyId;
  copy.APP_STORE_REVIEW_CONNECT_PRIVATE_KEY = readFileSync(args.p8Path, 'utf8');
  return copy;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(
      'diag-asc-customer-reviews-compare.js [--issuer uuid] [--key-id id] [--p8 arquivo.p8]',
    );
    return;
  }

  const env = applyCliAsc(process.env, args);
  const appId = appStoreReviewAppleAppId(env);
  const cred = appStoreReviewAscCredentialSource(env);
  const minimalUrl = appStoreReviewAscMinimalUrl(appId, 10);
  const jobUrl = appStoreReviewAscListUrl(appId, env);
  const recommendedUrl = `${jobUrl.includes('sort=') ? jobUrl : `${jobUrl}&sort=-createdDate`}`;

  const jwtFactory = () => {
    const {
      createAppStoreReviewConnectJwt,
    } = require('../src/app-store-reviews/app-store-review-connect-jwt');
    return createAppStoreReviewConnectJwt(env);
  };

  const minimal = await fetchAscCustomerReviewsPageDiag(minimalUrl, { jwtFactory });
  const job = await fetchAscCustomerReviewsPageDiag(jobUrl, { jwtFactory, env });
  const recommended = await fetchAscCustomerReviewsPageDiag(recommendedUrl, {
    jwtFactory,
    env,
  });

  const candidateResults = [];
  for (const candidateUrl of appStoreReviewAscStartUrlCandidates(appId, env)) {
    const row = await fetchAscCustomerReviewsPageDiag(candidateUrl, {
      jwtFactory,
      env,
    });
    candidateResults.push(row);
  }
  const anyOk = candidateResults.some(
    (r) => r && typeof r.httpStatus === 'number' && r.httpStatus >= 200 && r.httpStatus < 300,
  );

  console.log(
    JSON.stringify(
      {
        step: 'customerReviews_compare',
        appAppleId: appId,
        credentialSource: cred,
        minimal: 'ok' in minimal && minimal.ok === false ? minimal : minimal,
        job: 'ok' in job && job.ok === false ? job : job,
        recommended:
          'ok' in recommended && recommended.ok === false
            ? recommended
            : recommended,
        candidates: candidateResults,
        urls: { minimal: minimalUrl, job: jobUrl, recommended: recommendedUrl },
      },
      null,
      2,
    ),
  );

  if (!anyOk) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e?.message || String(e));
  process.exit(1);
});