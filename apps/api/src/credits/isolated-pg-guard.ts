/**
 * Dedicated disposable database. This is not `after` and not `after_refund_tx`.
 * The guard never reads DATABASE_URL.
 */
export const ISOLATED_PG_DATABASE = 'after_credit_ledger_test';
export const ISOLATED_PG_USER = 'after_credit_ledger_test';
export const ISOLATED_PG_HOST = '127.0.0.1';
export const ISOLATED_PG_PORT = '55432';
export const ISOLATED_PG_PASSWORD = 'disposable-local-only';
export const ISOLATED_PG_CONFIRM = 'disposable';

/** Stays false in source. A process connects only through isolatedSuiteRunAuthorized. */
export const ISOLATED_PG_CONNECT_ENABLED = false;

const REFUSED_DATABASES = new Set(['after', 'after_refund_tx', 'postgres', 'template1']);
const REFUSED_HOST_MARKERS = ['railway', 'rlwy', 'amazonaws', 'neon', 'supabase', 'render', 'production'];

export type IsolatedPgTarget = {
  enabled: string | undefined;
  confirm: string | undefined;
  host: string | undefined;
  port: string | undefined;
  database: string | undefined;
  user: string | undefined;
  password: string | undefined;
};

export function isolatedPgTargetFromDedicatedEnv(
  env: Record<string, string | undefined>,
): IsolatedPgTarget {
  return {
    enabled: env.AFTER_ISOLATED_PG_TEST,
    confirm: env.AFTER_ISOLATED_PG_CONFIRM,
    host: env.AFTER_ISOLATED_PG_HOST,
    port: env.AFTER_ISOLATED_PG_PORT,
    database: env.AFTER_ISOLATED_PG_DATABASE,
    user: env.AFTER_ISOLATED_PG_USER,
    password: env.AFTER_ISOLATED_PG_PASSWORD,
  };
}

export function assertIsolatedPgTarget(target: IsolatedPgTarget): void {
  if (target.enabled !== 'true') throw new Error('isolated pg disabled');
  if (target.confirm !== ISOLATED_PG_CONFIRM) throw new Error('isolated pg unconfirmed');
  if (target.host !== ISOLATED_PG_HOST) throw new Error('isolated pg host refused');
  if (target.port !== ISOLATED_PG_PORT) throw new Error('isolated pg port refused');
  if (target.database !== ISOLATED_PG_DATABASE) throw new Error('isolated pg database refused');
  if (REFUSED_DATABASES.has(target.database ?? '')) {
    throw new Error('isolated pg database refused');
  }
  if (target.user !== ISOLATED_PG_USER) throw new Error('isolated pg user refused');
  if (target.password !== ISOLATED_PG_PASSWORD) throw new Error('isolated pg password refused');
  const host = target.host.toLowerCase();
  if (REFUSED_HOST_MARKERS.some((marker) => host.includes(marker))) {
    throw new Error('isolated pg host refused');
  }
}

/**
 * The isolated suite may run only when every disposable check passes and the
 * process set AFTER_ISOLATED_PG_START=authorized. This does not read DATABASE_URL.
 */
export function isolatedSuiteRunAuthorized(
  env: Record<string, string | undefined>,
): boolean {
  if (env.AFTER_ISOLATED_PG_START !== 'authorized') return false;
  try {
    assertIsolatedPgTarget(isolatedPgTargetFromDedicatedEnv(env));
    return true;
  } catch {
    return false;
  }
}

/** Fails closed. Does not open a socket. */
export function connectIsolatedPostgres(): never {
  throw new Error('conexão PostgreSQL isolada não autorizada');
}
