export type PromoPushMode =
  | { kind: 'off' }
  | { kind: 'allowlist'; userIds: string[] }
  | { kind: 'public' };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Public send exists only when the flag is exactly "true" and the allowlist is empty.
 * Any allowlist, including together with the flag, restricts delivery to those ids.
 * A missing, blank, or unexpected flag never opens the public audience.
 * There is no wildcard: "*" is a literal id and matches nobody real.
 */
export function resolvePromoPushMode(
  env: NodeJS.ProcessEnv = process.env,
): PromoPushMode {
  const allowlist = parseAllowlist(env.PROMO_PUSH_ALLOWLIST_USER_IDS);
  if (allowlist.length > 0) {
    return { kind: 'allowlist', userIds: allowlist };
  }
  if (env.PROMO_PUSH_ENABLED?.trim() === 'true') {
    return { kind: 'public' };
  }
  return { kind: 'off' };
}

export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return [...new Set(ids)];
}

/** Missing value keeps the initial cap of 5. Any other invalid value sends nobody. */
export function promoPushMaxPerUserPerDay(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.PROMO_PUSH_MAX_PER_USER_PER_DAY;
  if (raw == null || raw.trim() === '') return 5;
  if (!/^\d+$/.test(raw.trim())) return 0;
  const value = Number(raw.trim());
  if (value > 100) return 0;
  return value;
}

/** Missing value keeps 6 hours. Invalid value makes the detected city never fresh. */
export function promoPushLocationMaxAgeMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.PROMO_PUSH_LOCATION_MAX_AGE_HOURS;
  if (raw == null || raw.trim() === '') return 6 * 60 * 60 * 1000;
  if (!/^\d+$/.test(raw.trim())) return 0;
  const hours = Number(raw.trim());
  if (hours > 168) return 0;
  return hours * 60 * 60 * 1000;
}

export function promoPushCapWindowStart(now: Date): Date {
  return new Date(now.getTime() - DAY_MS);
}
