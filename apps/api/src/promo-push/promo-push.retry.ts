export const FCM_MULTICAST_LIMIT = 500;
export const PROMO_PUSH_MAX_ATTEMPTS = 5;
export const PROMO_PUSH_POLL_MS = 30_000;
export const PROMO_PUSH_LOCK_MS = 120_000;

export function chunkList<T>(items: T[], size = FCM_MULTICAST_LIMIT): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('invalid chunk size');
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function nextPromoPushAttempt(now: Date, attempts: number): Date {
  const delay = Math.min(
    60_000 * 2 ** Math.max(0, attempts - 1),
    15 * 60_000,
  );
  return new Date(now.getTime() + delay);
}

const LOG_KEYS = new Set([
  'sent',
  'failed',
  'invalid',
  'skipped',
  'targeted',
  'attempt',
]);

export function formatPromoPushLog(
  eventId: string,
  outcome: string,
  extra: Record<string, number> = {},
): string {
  const parts = Object.entries(extra)
    .filter(([key, value]) => LOG_KEYS.has(key) && Number.isFinite(value))
    .map(([key, value]) => `${key}=${value}`);
  const suffix = parts.length ? ` ${parts.join(' ')}` : '';
  return `promo-push event=${eventId} outcome=${outcome}${suffix}`;
}
