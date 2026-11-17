export type AppStoreReviewEnv = NodeJS.ProcessEnv;

export const DEFAULT_APP_STORE_REVIEW_APPLE_ID = '6812746791';

export const DEFAULT_APP_STORE_REVIEW_NOTIFY_TO =
  'desenvolvimento.after@gmail.com';

export const APP_STORE_REVIEW_POLL_MS = 3_600_000;

export const APP_STORE_REVIEW_LOCK_MS = 1_800_000;

export const APP_STORE_REVIEW_MAX_EMAIL_ATTEMPTS = 8;

const ASC_API = 'https://api.appstoreconnect.apple.com/v1';

export function appStoreReviewEnabled(env: AppStoreReviewEnv = process.env): boolean {
  const flag = env.APP_STORE_REVIEW_EMAIL_ENABLED?.trim().toLowerCase();
  if (flag === 'false' || flag === '0') return false;
  return env.NODE_ENV !== 'test';
}

export function appStoreReviewNotifyTo(
  env: AppStoreReviewEnv = process.env,
): string {
  return (
    env.APP_STORE_REVIEW_NOTIFY_TO?.trim() ||
    DEFAULT_APP_STORE_REVIEW_NOTIFY_TO
  );
}

export function appStoreReviewAppleAppId(
  env: AppStoreReviewEnv = process.env,
): string {
  return (
    env.APPLE_APP_APPLE_ID?.trim() ||
    env.APP_STORE_REVIEW_APPLE_ID?.trim() ||
    DEFAULT_APP_STORE_REVIEW_APPLE_ID
  );
}

export function appStoreReviewPollMs(
  env: AppStoreReviewEnv = process.env,
): number {
  const raw = env.APP_STORE_REVIEW_POLL_MS?.trim();
  if (!raw) return APP_STORE_REVIEW_POLL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 60_000 ? Math.floor(n) : APP_STORE_REVIEW_POLL_MS;
}

export function appStoreReviewAscListUrl(appAppleId: string): string {
  return `${ASC_API}/apps/${encodeURIComponent(appAppleId)}/customerReviews?limit=200&sort=-createdDate`;
}

export function appStoreConnectReviewAdminUrl(
  appAppleId: string,
  reviewId: string,
): string {
  const base = `https://appstoreconnect.apple.com/apps/${encodeURIComponent(appAppleId)}/distribution/activity/ios/ratingsResponses`;
  return `${base}?reviewId=${encodeURIComponent(reviewId)}`;
}