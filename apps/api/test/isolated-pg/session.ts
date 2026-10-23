import { createRequire } from 'module';
import type { IsolatedSql } from '../../src/credits/credit-ledger.pg';
import {
  ISOLATED_PG_CONNECT_ENABLED,
  ISOLATED_PG_DATABASE,
  ISOLATED_PG_HOST,
  ISOLATED_PG_PASSWORD,
  ISOLATED_PG_PORT,
  ISOLATED_PG_USER,
  assertIsolatedPgTarget,
  isolatedPgTargetFromDedicatedEnv,
  isolatedSuiteRunAuthorized,
} from '../../src/credits/isolated-pg-guard';

export interface IsolatedSession extends IsolatedSql {
  close(): Promise<void>;
}

/**
 * Opens a session only after the hard stop, the disposable-target guard and
 * the explicit start authorization. This phase keeps the hard stop false,
 * so the function returns before importing a driver or opening a socket.
 */
export async function openIsolatedSession(): Promise<IsolatedSession> {
  if (!ISOLATED_PG_CONNECT_ENABLED && !isolatedSuiteRunAuthorized(process.env)) {
    throw new Error('conexão PostgreSQL isolada não autorizada');
  }
  assertIsolatedPgTarget(isolatedPgTargetFromDedicatedEnv(process.env));
  if (process.env.AFTER_ISOLATED_PG_START !== 'authorized') {
    throw new Error('conexão PostgreSQL isolada não autorizada');
  }
  return openDedicatedPgClient();
}

export async function withIsolatedTransaction<T>(
  body: (db: IsolatedSql) => Promise<T>,
): Promise<T> {
  const session = await openIsolatedSession();
  try {
    await session.query('BEGIN');
    try {
      const value = await body(session);
      await session.query('COMMIT');
      return value;
    } catch (error) {
      await session.query('ROLLBACK');
      throw error;
    }
  } finally {
    await session.close();
  }
}

/** Runs the body and always rolls the transaction back, including on success. */
export async function withRolledBackTransaction<T>(
  body: (db: IsolatedSql) => Promise<T>,
): Promise<T> {
  const session = await openIsolatedSession();
  try {
    await session.query('BEGIN');
    try {
      const value = await body(session);
      await session.query('ROLLBACK');
      return value;
    } catch (error) {
      await session.query('ROLLBACK');
      throw error;
    }
  } finally {
    await session.close();
  }
}

/** Throws instead of sending the matching statement. */
export function failOnQuery(db: IsolatedSql, marker: string): IsolatedSql {
  return {
    query: async (text, params) => {
      if (text.includes(marker)) throw new Error('injected');
      return db.query(text, params);
    },
  };
}

/** Lets the statement finish, then throws so the caller transaction can roll it back. */
export function failAfterQuery(db: IsolatedSql, marker: string): IsolatedSql {
  let pending = true;
  return {
    query: async (text, params) => {
      const rows = await db.query(text, params);
      if (pending && text.includes(marker)) {
        pending = false;
        throw new Error('injected');
      }
      return rows;
    },
  };
}

export function sqlState(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function isRestrictViolation(error: unknown): boolean {
  const code = sqlState(error);
  return code === '23503' || code === '23001';
}

export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function openDedicatedPgClient(): Promise<IsolatedSession> {
  const pg = createRequire(__filename)('pg') as {
    Client: new (config: {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
    }) => {
      connect(): Promise<void>;
      query(text: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }>;
      end(): Promise<void>;
    };
  };
  const client = new pg.Client({
    host: ISOLATED_PG_HOST,
    port: Number(ISOLATED_PG_PORT),
    database: ISOLATED_PG_DATABASE,
    user: ISOLATED_PG_USER,
    password: ISOLATED_PG_PASSWORD,
  });
  await client.connect();
  return {
    query: async <T>(text: string, params: readonly unknown[]) => {
      const result = await client.query(text, params);
      return result.rows as T[];
    },
    close: () => client.end(),
  };
}
