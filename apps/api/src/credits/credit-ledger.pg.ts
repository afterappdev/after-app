import {
  CreditLedgerError,
  creditLedgerLockKeys,
  type CreditLedgerTx,
  type StoredLedgerEntry,
  type StoredObligation,
} from './credit-ledger.persist';

/**
 * Minimal SQL session. Not a Prisma client and not opened by this module.
 * A future runner may pass prisma.$queryRaw through this shape after an
 * authorized connection. Importing this file does not connect.
 */
export interface IsolatedSql {
  query<T>(text: string, params: readonly unknown[]): Promise<T[]>;
}

export class IsolatedPgDeadlock extends Error {
  readonly code = 'deadlock';
}

const LOCK_SQL: Record<string, string> = {
  venue: 'SELECT id FROM "Venue" WHERE id = $1 FOR UPDATE',
  purchase: 'SELECT id FROM "CreditPurchase" WHERE id = $1 FOR UPDATE',
  obligation: 'SELECT id FROM "CreditObligation" WHERE id = $1 FOR UPDATE',
};

/** Single-column venue links. Failure means the venue row is absent. */
export const VENUE_ONLY_FOREIGN_KEYS = new Set([
  'CreditObligation_venueId_fkey',
  'CreditLedgerEntry_venueId_fkey',
]);

/**
 * Composite links. PostgreSQL reports the same SQLSTATE when the parent is
 * missing and when it belongs to another venue, so the code alone is not enough.
 */
export const COMPOSITE_FOREIGN_KEYS = new Set([
  'CreditObligation_purchaseId_venueId_fkey',
  'CreditLedgerEntry_purchaseId_venueId_fkey',
  'CreditLedgerEntry_obligationId_venueId_fkey',
  'CreditLedgerEntry_redemptionId_venueId_fkey',
  'CreditLedgerEntry_bannerId_venueId_fkey',
]);

export function translateCreditLedgerDbError(error: unknown): Error {
  const code = readCode(error);
  if (code === '23505' || code === 'P2002') return new CreditLedgerError('divergent');
  if (code === '23514') return new CreditLedgerError('invariant');
  if (code === '23503' || code === 'P2003') {
    return new CreditLedgerError(foreignKeyReason(readConstraint(error)));
  }
  if (code === '40P01') return new IsolatedPgDeadlock();
  return error instanceof Error ? error : new Error('credit ledger db');
}

/**
 * Distinguishes a missing parent from a cross-venue link.
 * The caller supplies the venue already read before the failing statement.
 * A failed statement aborts the PostgreSQL transaction, so this does not query.
 */
export function interpretCompositeForeignKey(input: {
  constraint: string | undefined;
  referencedVenueId: string | null;
  requestedVenueId: string;
}): 'missing_reference' | 'venue_mismatch' | 'unresolved_reference' {
  if (input.constraint && VENUE_ONLY_FOREIGN_KEYS.has(input.constraint)) {
    return 'missing_reference';
  }
  if (!input.constraint || !COMPOSITE_FOREIGN_KEYS.has(input.constraint)) {
    return 'unresolved_reference';
  }
  if (input.referencedVenueId == null) return 'missing_reference';
  if (input.referencedVenueId !== input.requestedVenueId) return 'venue_mismatch';
  return 'unresolved_reference';
}

/**
 * Row locks in sorted key order, inside the caller transaction.
 * There is no retry: a unique violation or a deadlock aborts that transaction.
 * Venue locks read "Venue", not "CreditWallet", so the balance is not written.
 */
export function createPostgresCreditLedgerTx(db: IsolatedSql): CreditLedgerTx {
  return {
    lock: async (keys: string[]) => {
      for (const key of [...new Set(keys)].sort()) {
        const split = key.indexOf(':');
        const kind = split === -1 ? '' : key.slice(0, split);
        const id = split === -1 ? '' : key.slice(split + 1);
        const text = LOCK_SQL[kind];
        if (!text || !id) throw new CreditLedgerError('invariant');
        try {
          await db.query(text, [id]);
        } catch (error) {
          throw translateCreditLedgerDbError(error);
        }
      }
    },
    purchaseVenue: async (purchaseId) => {
      const rows = await queryOrTranslate<{ venueId: string }>(
        db,
        'SELECT "venueId" FROM "CreditPurchase" WHERE id = $1',
        [purchaseId],
      );
      return rows[0]?.venueId ?? null;
    },
    findObligationByPurchase: async (purchaseId) => {
      const rows = await queryOrTranslate<StoredObligation>(
        db,
        `SELECT "id", "venueId", "purchaseId", "creditsOriginal", "creditsRecovered",
                "creditsOpened", "creditsSettled", "status", "source"
         FROM "CreditObligation" WHERE "purchaseId" = $1`,
        [purchaseId],
      );
      return rows[0] ?? null;
    },
    findObligationById: async (id) => {
      const rows = await queryOrTranslate<StoredObligation>(
        db,
        `SELECT "id", "venueId", "purchaseId", "creditsOriginal", "creditsRecovered",
                "creditsOpened", "creditsSettled", "status", "source"
         FROM "CreditObligation" WHERE "id" = $1`,
        [id],
      );
      return rows[0] ?? null;
    },
    findEntry: async (operationKey) => {
      const rows = await queryOrTranslate<StoredLedgerEntry>(
        db,
        `SELECT "id", "operationKey", "venueId", "purchaseId", "obligationId",
                "kind", "credits", "availableDelta", "debtDelta"
         FROM "CreditLedgerEntry" WHERE "operationKey" = $1`,
        [operationKey],
      );
      return rows[0] ?? null;
    },
    insertObligation: async (row) => {
      await executeOrTranslate(
        db,
        `INSERT INTO "CreditObligation" (
           "id", "venueId", "purchaseId", "creditsOriginal", "creditsRecovered",
           "creditsOpened", "creditsSettled", "status", "source", "createdAt", "updatedAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
        [
          row.id,
          row.venueId,
          row.purchaseId,
          row.creditsOriginal,
          row.creditsRecovered,
          row.creditsOpened,
          row.creditsSettled,
          row.status,
          row.source,
          new Date(),
        ],
      );
    },
    insertEntry: async (row) => {
      await executeOrTranslate(
        db,
        `INSERT INTO "CreditLedgerEntry" (
           "id", "venueId", "operationKey", "kind", "purchaseId", "obligationId",
           "credits", "availableDelta", "debtDelta", "createdAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          row.id,
          row.venueId,
          row.operationKey,
          row.kind,
          row.purchaseId,
          row.obligationId,
          row.credits,
          row.availableDelta,
          row.debtDelta,
          new Date(),
        ],
      );
    },
  };
}

export function postgresLockOrder(venueId: string, purchaseId: string): string[] {
  return creditLedgerLockKeys(venueId, purchaseId);
}

async function queryOrTranslate<T>(
  db: IsolatedSql,
  text: string,
  params: readonly unknown[],
): Promise<T[]> {
  try {
    return await db.query<T>(text, params);
  } catch (error) {
    throw translateCreditLedgerDbError(error);
  }
}

async function executeOrTranslate(
  db: IsolatedSql,
  text: string,
  params: readonly unknown[],
): Promise<void> {
  await queryOrTranslate(db, text, params);
}

function foreignKeyReason(
  constraint: string | undefined,
): 'missing_reference' | 'unresolved_reference' {
  if (constraint && VENUE_ONLY_FOREIGN_KEYS.has(constraint)) return 'missing_reference';
  return 'unresolved_reference';
}

function readCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function readConstraint(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as {
    constraint?: unknown;
    message?: unknown;
    meta?: { constraint?: unknown };
  };
  if (typeof record.constraint === 'string') return record.constraint;
  if (typeof record.meta?.constraint === 'string') return record.meta.constraint;
  if (typeof record.message !== 'string') return undefined;
  return record.message.match(/constraint "([^"]+)"/)?.[1];
}
