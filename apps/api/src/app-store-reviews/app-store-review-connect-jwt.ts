import { createPrivateKey, sign as cryptoSign } from 'crypto';
import { normalizeApplePrivateKey } from '../auth/apple-web.util';
import type { AppStoreReviewEnv } from './app-store-review.config';

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}

/** Prefer APP_STORE_REVIEW_CONNECT_*; fallback APP_STORE_CONNECT_* (métricas). */
export function appStoreReviewAscCredentialSource(
  env: AppStoreReviewEnv = process.env,
): 'review' | 'metrics' | 'missing' {
  const review =
    env.APP_STORE_REVIEW_CONNECT_ISSUER_ID?.trim() &&
    env.APP_STORE_REVIEW_CONNECT_KEY_ID?.trim() &&
    env.APP_STORE_REVIEW_CONNECT_PRIVATE_KEY?.trim();
  if (review) return 'review';
  const metrics =
    env.APP_STORE_CONNECT_ISSUER_ID?.trim() &&
    env.APP_STORE_CONNECT_KEY_ID?.trim() &&
    env.APP_STORE_CONNECT_PRIVATE_KEY?.trim();
  if (metrics) return 'metrics';
  return 'missing';
}

export function createAppStoreReviewConnectJwt(
  env: AppStoreReviewEnv = process.env,
): string | null {
  const issuerId =
    env.APP_STORE_REVIEW_CONNECT_ISSUER_ID?.trim() ||
    env.APP_STORE_CONNECT_ISSUER_ID?.trim();
  const keyId =
    env.APP_STORE_REVIEW_CONNECT_KEY_ID?.trim() ||
    env.APP_STORE_CONNECT_KEY_ID?.trim();
  const privateKey = normalizeApplePrivateKey(
    env.APP_STORE_REVIEW_CONNECT_PRIVATE_KEY ||
      env.APP_STORE_CONNECT_PRIVATE_KEY,
  );
  if (!issuerId || !keyId || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: issuerId,
      iat: now,
      exp: now + 1200,
      aud: 'appstoreconnect-v1',
    }),
  );
  const unsigned = `${header}.${claim}`;
  try {
    const key = createPrivateKey(privateKey);
    const signature = cryptoSign('sha256', Buffer.from(unsigned), {
      key,
      dsaEncoding: 'ieee-p1363',
    });
    return `${unsigned}.${signature.toString('base64url')}`;
  } catch {
    return null;
  }
}