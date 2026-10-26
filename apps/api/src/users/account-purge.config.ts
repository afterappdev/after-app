const DEFAULT_POLL_MS = 60_000;
const DEFAULT_LEASE_MS = 5 * 60_000;
const DEFAULT_BATCH = 5;

function readBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return defaultValue;
}

function readInt(
  raw: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, parsed));
}

export type AccountPurgeEnv = {
  ACCOUNT_PURGE_ENABLED?: string;
  ACCOUNT_PURGE_DRY_RUN?: string;
  ACCOUNT_PURGE_ARM_DESTRUCTIVE?: string;
  ACCOUNT_PURGE_EXECUTE?: string;
  ACCOUNT_PURGE_POLL_MS?: string;
  ACCOUNT_PURGE_LEASE_MS?: string;
  ACCOUNT_PURGE_BATCH?: string;
  NODE_ENV?: string;
};

export function accountPurgeEnabled(env: AccountPurgeEnv = process.env): boolean {
  return readBool(env.ACCOUNT_PURGE_ENABLED, false);
}

export function accountPurgeDryRun(env: AccountPurgeEnv = process.env): boolean {
  return readBool(env.ACCOUNT_PURGE_DRY_RUN, true);
}

export function accountPurgePollMs(env: AccountPurgeEnv = process.env): number {
  return readInt(env.ACCOUNT_PURGE_POLL_MS, DEFAULT_POLL_MS, 5_000, 3_600_000);
}

export function accountPurgeLeaseMs(env: AccountPurgeEnv = process.env): number {
  return readInt(env.ACCOUNT_PURGE_LEASE_MS, DEFAULT_LEASE_MS, 10_000, 3_600_000);
}

export function accountPurgeBatchSize(env: AccountPurgeEnv = process.env): number {
  return readInt(env.ACCOUNT_PURGE_BATCH, DEFAULT_BATCH, 1, 50);
}

/**
 * Automatic destructive purge requires explicit arming (Phase G).
 * Production is always blocked. A single mis-set flag cannot enable purge.
 */
export function accountPurgeDestructiveAllowed(
  env: AccountPurgeEnv = process.env,
): boolean {
  if ((env.NODE_ENV ?? process.env.NODE_ENV) === 'production') {
    return false;
  }
  if (!accountPurgeEnabled(env)) {
    return false;
  }
  if (accountPurgeDryRun(env)) {
    return false;
  }
  if (!readBool(env.ACCOUNT_PURGE_ARM_DESTRUCTIVE, false)) {
    return false;
  }
  if (!readBool(env.ACCOUNT_PURGE_EXECUTE, false)) {
    return false;
  }
  return true;
}
