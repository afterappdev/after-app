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

/** Probe/diag: só limit, sem sort/include (recomendado Apple). */
export function appStoreReviewAscMinimalUrl(
  appAppleId: string,
  limit = 10,
): string {
  return `${ASC_API}/apps/${encodeURIComponent(appAppleId)}/customerReviews?limit=${limit}`;
}

export function appStoreReviewAscPageLimit(
  env: AppStoreReviewEnv = process.env,
): number {
  const raw = Number(env.APP_STORE_REVIEW_ASC_LIMIT?.trim() ?? '20');
  if (!Number.isFinite(raw)) return 20;
  return Math.min(200, Math.max(1, Math.floor(raw)));
}

/** Paginação do job: sort=-createdDate e limit moderado (Apple 500 em vários limites). */
export function appStoreReviewAscListUrl(
  appAppleId: string,
  env: AppStoreReviewEnv = process.env,
): string {
  const limit = appStoreReviewAscPageLimit(env);
  const sortRaw = env.APP_STORE_REVIEW_ASC_SORT?.trim();
  const sort =
    sortRaw === 'none' || sortRaw === ''
      ? null
      : sortRaw ?? '-createdDate';
  const base = `${ASC_API}/apps/${encodeURIComponent(appAppleId)}/customerReviews?limit=${limit}`;
  if (!sort) return base;
  return `${base}&sort=${encodeURIComponent(sort)}`;
}

/** URL estável para health/probe (mesmos parâmetros do job). */
export function appStoreReviewAscProbeUrl(
  appAppleId: string,
  env: AppStoreReviewEnv = process.env,
): string {
  return appStoreReviewAscListUrl(appAppleId, env);
}

/** Ordem de tentativa quando a Apple devolve 5xx em um perfil de query. */
export function appStoreReviewAscStartUrlCandidates(
  appAppleId: string,
  env: AppStoreReviewEnv = process.env,
): string[] {
  const enc = encodeURIComponent(appAppleId);
  const base = `${ASC_API}/apps/${enc}/customerReviews`;
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (url: string) => {
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  };
  add(appStoreReviewAscListUrl(appAppleId, env));
  add(`${base}?limit=20&sort=-createdDate`);
  add(`${base}?limit=10&sort=-createdDate`);
  add(appStoreReviewAscMinimalUrl(appAppleId, 10));
  add(`${base}?limit=200&sort=-createdDate`);
  return out;
}

export function appStoreConnectReviewAdminUrl(
  appAppleId: string,
  reviewId: string,
): string {
  const base = `https://appstoreconnect.apple.com/apps/${encodeURIComponent(appAppleId)}/distribution/activity/ios/ratingsResponses`;
  return `${base}?reviewId=${encodeURIComponent(reviewId)}`;
}