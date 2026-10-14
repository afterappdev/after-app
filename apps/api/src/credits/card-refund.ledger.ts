import { randomUUID } from 'crypto';
import { CreditPurchase, Prisma } from '@prisma/client';

/** Not scheduled. Proposed Railway interval after the migration is applied. */
export const CARD_PAID_RECONCILE_INTERVAL_MS = 15 * 60 * 1000;
export const CARD_PAID_RECONCILE_BATCH = 20;
export const CARD_PAID_RECONCILE_MIN_AGE_MS = 10 * 60 * 1000;
export const CARD_PAID_RECONCILE_LEASE_MS = 2 * 60 * 1000;
export const CARD_RECONCILE_GET_TIMEOUT_MS = 10 * 1000;
export const CARD_RECONCILE_COOLDOWN_CAP_MS = CARD_PAID_RECONCILE_INTERVAL_MS;
export const CARD_RECONCILE_COOLDOWN_DEFAULT_MS = CARD_RECONCILE_COOLDOWN_CAP_MS;

const SHORTFALL = 'shortfall';
const PARTIAL_REVIEW = 'partial_review';
const REFUND_REVIEW = 'refund_review';

/**
 * Credits a full card refund may take. A negative balance contributes nothing,
 * so the refund cannot raise the wallet or book a negative recovery.
 * The bound parameter that follows this fragment is the purchase credit count.
 */
export const CARD_FULL_REFUND_RECOVERABLE_SQL =
  'LEAST(GREATEST(w.balance, 0),';

/** Same rule as {@link CARD_FULL_REFUND_RECOVERABLE_SQL}. Non-positive credits recover nothing. */
export function recoverableCardCredits(balance: number, credits: number): number {
  if (credits <= 0) return 0;
  const available = balance > 0 ? balance : 0;
  return credits > available ? available : credits;
}

type RefundTx = Prisma.TransactionClient;

export type CardTerminalInput = {
  purchaseId: string;
  status: 'FAILED' | 'CANCELLED' | 'REFUNDED';
  refundScope: 'none' | 'partial' | 'full' | 'review';
  refundedAmountBrl: number | null;
  refundId: string | null;
};

export async function tryAcquireCardReconcileLease(
  db: Prisma.TransactionClient | PrismaServiceLike,
  now: Date,
  token: string,
): Promise<boolean> {
  const until = new Date(now.getTime() + CARD_PAID_RECONCILE_LEASE_MS);
  const rows = await db.$queryRaw<Array<{ id: number }>>`
    UPDATE "CardReconcileLock"
    SET "lockedUntil" = ${until}, "lockedBy" = ${token}
    WHERE id = 1 AND "lockedUntil" <= ${now}
    RETURNING id
  `;
  return Array.isArray(rows) && rows.length > 0;
}

export async function releaseCardReconcileLease(
  db: Prisma.TransactionClient | PrismaServiceLike,
  now: Date,
  token: string,
): Promise<void> {
  await db.$executeRaw`
    UPDATE "CardReconcileLock"
    SET "lockedUntil" = ${now}, "lockedBy" = ''
    WHERE id = 1 AND "lockedBy" = ${token}
  `;
}

export type CardReconcileCursor = {
  confirmedAt: Date;
  purchaseId: string;
};

export function paidCardReconcileWhere(
  cutoff: Date,
  cursor: CardReconcileCursor | null,
): Prisma.CreditPurchaseWhereInput {
  const eligible: Prisma.CreditPurchaseWhereInput = {
    provider: 'card',
    status: 'PAID',
    confirmedAt: { not: null, lt: cutoff },
  };
  if (!cursor) return eligible;
  return {
    AND: [
      eligible,
      {
        OR: [
          { confirmedAt: { gt: cursor.confirmedAt } },
          {
            AND: [
              { confirmedAt: { equals: cursor.confirmedAt } },
              { id: { gt: cursor.purchaseId } },
            ],
          },
        ],
      },
    ],
  };
}

/** Cursor and cooldown are stored as UTC wall-clock values, independent of the session TimeZone. */
export async function readCardReconcileCursor(
  db: PrismaServiceLike,
  now: Date,
  token: string,
): Promise<{
  owned: boolean;
  cursor: CardReconcileCursor | null;
  cooldownUntil: Date | null;
}> {
  const rows = await db.$queryRaw<
    Array<{
      cursorPurchaseId: string | null;
      cursorConfirmedAtMs: number | null;
      cooldownUntilMs: number | null;
    }>
  >`
    SELECT "cursorPurchaseId",
           (EXTRACT(EPOCH FROM ("cursorConfirmedAt" AT TIME ZONE 'UTC')) * 1000) AS "cursorConfirmedAtMs",
           (EXTRACT(EPOCH FROM ("cooldownUntil" AT TIME ZONE 'UTC')) * 1000) AS "cooldownUntilMs"
    FROM "CardReconcileLock"
    WHERE id = 1 AND "lockedBy" = ${token} AND "lockedUntil" > ${now}
  `;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return { owned: false, cursor: null, cooldownUntil: null };
  const cooldownUntil = instantFromEpoch(row.cooldownUntilMs);
  const confirmedAt = instantFromEpoch(row.cursorConfirmedAtMs);
  if (!confirmedAt || !row.cursorPurchaseId) {
    return { owned: true, cursor: null, cooldownUntil };
  }
  return {
    owned: true,
    cursor: { confirmedAt, purchaseId: row.cursorPurchaseId },
    cooldownUntil,
  };
}

export async function cardReconcileColumnsReady(
  db: PrismaServiceLike,
): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'CardReconcileLock'
      AND column_name IN ('cursorConfirmedAt', 'cursorPurchaseId', 'cooldownUntil')
  `;
  const names = new Set(
    (Array.isArray(rows) ? rows : []).map((row) => row.column_name),
  );
  return (
    names.has('cursorConfirmedAt') &&
    names.has('cursorPurchaseId') &&
    names.has('cooldownUntil')
  );
}

/** Only the exact value true enables the schedule. Every other value stays off. */
export function cardRefundReconcileEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CARD_REFUND_RECONCILE_ENABLED?.trim() === 'true';
}

function instantFromEpoch(value: number | null): Date | null {
  if (value == null) return null;
  const ms = Number(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

/** Returns false when this execution no longer owns a valid lease. */
export async function advanceCardReconcileCursor(
  db: PrismaServiceLike,
  now: Date,
  token: string,
  cursor: CardReconcileCursor,
): Promise<boolean> {
  const updated = await db.$executeRaw`
    UPDATE "CardReconcileLock"
    SET "cursorConfirmedAt" = (${cursor.confirmedAt}::timestamptz AT TIME ZONE 'UTC'),
        "cursorPurchaseId" = ${cursor.purchaseId}
    WHERE id = 1
      AND "lockedBy" = ${token}
      AND "lockedUntil" > ${now}
  `;
  return Number(updated) > 0;
}

/**
 * Extends the lease only for the owner while it is still valid.
 * Returns false when this execution no longer owns it.
 */
export async function renewCardReconcileLease(
  db: PrismaServiceLike,
  now: Date,
  token: string,
): Promise<boolean> {
  const until = new Date(now.getTime() + CARD_PAID_RECONCILE_LEASE_MS);
  const updated = await db.$executeRaw`
    UPDATE "CardReconcileLock"
    SET "lockedUntil" = ${until}
    WHERE id = 1
      AND "lockedBy" = ${token}
      AND "lockedUntil" > ${now}
  `;
  return Number(updated) > 0;
}

/**
 * Same ownership check as renew, inside the financial transaction.
 * The UPDATE locks the row until commit, so a lease that expires after the
 * in-memory check cannot be taken by another instance before the refund lands.
 * Returns false without changing the purchase when ownership is already gone.
 */
export async function claimCardReconcileLease(
  db: PrismaServiceLike,
  now: Date,
  token: string,
): Promise<boolean> {
  const until = new Date(now.getTime() + CARD_PAID_RECONCILE_LEASE_MS);
  const rows = await db.$queryRaw<Array<{ id: number }>>`
    UPDATE "CardReconcileLock"
    SET "lockedUntil" = ${until}
    WHERE id = 1
      AND "lockedBy" = ${token}
      AND "lockedUntil" > ${now}
    RETURNING id
  `;
  return Array.isArray(rows) && rows.length > 0;
}

/** Pauses Orders API calls. Does not take or release the concurrency lease. */
export async function armCardReconcileCooldown(
  db: PrismaServiceLike,
  now: Date,
  token: string,
  until: Date,
): Promise<boolean> {
  const updated = await db.$executeRaw`
    UPDATE "CardReconcileLock"
    SET "cooldownUntil" = (${until}::timestamptz AT TIME ZONE 'UTC')
    WHERE id = 1
      AND "lockedBy" = ${token}
      AND "lockedUntil" > ${now}
  `;
  return Number(updated) > 0;
}

export function cardReconcileCooldownMs(
  retryAfter: string | null | undefined,
  now: Date,
): number {
  const parsed = parseRetryAfterMs(retryAfter, now);
  if (parsed == null || parsed <= 0) return CARD_RECONCILE_COOLDOWN_DEFAULT_MS;
  return Math.min(parsed, CARD_RECONCILE_COOLDOWN_CAP_MS);
}

function parseRetryAfterMs(
  value: string | null | undefined,
  now: Date,
): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds)) return null;
    return Math.round(seconds * 1000);
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return parsed - now.getTime();
}

/** Returns false when this execution no longer owns a valid lease. */
export async function resetCardReconcileCursor(
  db: PrismaServiceLike,
  now: Date,
  token: string,
): Promise<boolean> {
  const updated = await db.$executeRaw`
    UPDATE "CardReconcileLock"
    SET "cursorConfirmedAt" = NULL,
        "cursorPurchaseId" = NULL
    WHERE id = 1
      AND "lockedBy" = ${token}
      AND "lockedUntil" > ${now}
  `;
  return Number(updated) > 0;
}

type PrismaServiceLike = {
  $queryRaw: Prisma.TransactionClient['$queryRaw'];
  $executeRaw: Prisma.TransactionClient['$executeRaw'];
};

/**
 * Status changes are conditional updates inside the transaction.
 * The purchase object loaded before this call is not used to decide a debit.
 */
export async function settleCardTerminalStatus(
  tx: RefundTx,
  input: CardTerminalInput,
): Promise<CreditPurchase | null> {
  await tx.$queryRaw`
    SELECT id FROM "CreditPurchase" WHERE id = ${input.purchaseId} FOR UPDATE
  `;
  const current = await tx.creditPurchase.findUnique({
    where: { id: input.purchaseId },
  });
  if (!current || current.provider !== 'card') return current;

  if (input.refundScope === 'review') {
    if (current.status === 'PAID') {
      await insertAudit(tx, {
        purchaseId: current.id,
        venueId: current.venueId,
        kind: REFUND_REVIEW,
        creditsRecovered: null,
        creditsUnrecovered: null,
        originalAmount: moneyOrNull(current.amountPaid),
        refundedAmount: null,
        refundId: null,
      });
    }
    return current;
  }

  if (input.status === 'REFUNDED' && input.refundScope === 'partial') {
    await insertAudit(tx, {
      purchaseId: current.id,
      venueId: current.venueId,
      kind: PARTIAL_REVIEW,
      creditsRecovered: null,
      creditsUnrecovered: null,
      originalAmount: moneyOrNull(current.amountPaid),
      refundedAmount: input.refundedAmountBrl,
      refundId: input.refundId,
    });
    return tx.creditPurchase.findUnique({ where: { id: current.id } });
  }

  if (input.status === 'REFUNDED' && input.refundScope === 'full') {
    const fromPaid = await tx.creditPurchase.updateMany({
      where: { id: current.id, status: 'PAID' },
      data: { status: 'REFUNDED' },
    });
    if (fromPaid.count === 1) {
      const clawback = await deductAvailableCredits(
        tx,
        current.venueId,
        current.credits,
      );
      if (clawback.unrecovered > 0) {
        await insertAudit(tx, {
          purchaseId: current.id,
          venueId: current.venueId,
          kind: SHORTFALL,
          creditsRecovered: clawback.recovered,
          creditsUnrecovered: clawback.unrecovered,
          originalAmount: moneyOrNull(current.amountPaid),
          refundedAmount: null,
          refundId: input.refundId,
        });
      }
      return tx.creditPurchase.findUnique({ where: { id: current.id } });
    }

    await tx.creditPurchase.updateMany({
      where: { id: current.id, status: 'PENDING' },
      data: { status: 'REFUNDED' },
    });
    return tx.creditPurchase.findUnique({ where: { id: current.id } });
  }

  if (input.status === 'FAILED' || input.status === 'CANCELLED') {
    await tx.creditPurchase.updateMany({
      where: { id: current.id, status: 'PENDING' },
      data: { status: input.status },
    });
    return tx.creditPurchase.findUnique({ where: { id: current.id } });
  }

  return current;
}

async function deductAvailableCredits(
  tx: RefundTx,
  venueId: string,
  credits: number,
): Promise<{ recovered: number; unrecovered: number }> {
  if (credits <= 0) return { recovered: 0, unrecovered: 0 };
  const rows = await tx.$queryRaw<Array<{ previous: number; next: number }>>`
    WITH prev AS (
      SELECT "venueId", balance AS previous
      FROM "CreditWallet"
      WHERE "venueId" = ${venueId}
      FOR UPDATE
    ),
    upd AS (
      UPDATE "CreditWallet" AS w
      SET balance = w.balance - LEAST(GREATEST(w.balance, 0), ${credits}),
          "updatedAt" = CURRENT_TIMESTAMP
      FROM prev
      WHERE w."venueId" = prev."venueId"
      RETURNING w.balance AS next, prev.previous AS previous
    )
    SELECT previous, next FROM upd
  `;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return { recovered: 0, unrecovered: credits };
  const recovered = Number(row.previous) - Number(row.next);
  return { recovered, unrecovered: credits - recovered };
}

type AuditInput = {
  purchaseId: string;
  venueId: string;
  kind: string;
  creditsRecovered: number | null;
  creditsUnrecovered: number | null;
  originalAmount: number | null;
  refundedAmount: number | null;
  refundId: string | null;
};

async function insertAudit(tx: RefundTx, input: AuditInput): Promise<void> {
  if (input.kind === PARTIAL_REVIEW) {
    await insertPartialAudit(tx, input);
    return;
  }
  await insertAuditOnce(tx, input);
}

/**
 * One partial_review row per purchase. A later proof replaces the amount
 * only when its cent value is strictly greater, so retries and an older
 * snapshot cannot reduce or double-count the accumulated sum.
 */
async function insertPartialAudit(tx: RefundTx, input: AuditInput): Promise<void> {
  const cents = moneyToCents(input.refundedAmount);
  if (cents == null) return;
  await tx.$executeRaw`
    INSERT INTO "CreditRefundAudit" (
      "id",
      "purchaseId",
      "venueId",
      "kind",
      "creditsRecovered",
      "creditsUnrecovered",
      "originalAmount",
      "refundedAmount",
      "refundId",
      "createdAt"
    ) VALUES (
      ${randomUUID()},
      ${input.purchaseId},
      ${input.venueId},
      ${input.kind},
      ${input.creditsRecovered},
      ${input.creditsUnrecovered},
      ${input.originalAmount},
      ${input.refundedAmount},
      ${input.refundId},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("purchaseId", "kind") DO UPDATE
    SET "refundedAmount" = EXCLUDED."refundedAmount",
        "refundId" = EXCLUDED."refundId"
    WHERE "CreditRefundAudit"."kind" = 'partial_review'
      AND (
        "CreditRefundAudit"."refundedAmount" IS NULL
        OR ROUND("CreditRefundAudit"."refundedAmount" * 100) < ${cents}
      )
  `;
}

async function insertAuditOnce(tx: RefundTx, input: AuditInput): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "CreditRefundAudit" (
      "id",
      "purchaseId",
      "venueId",
      "kind",
      "creditsRecovered",
      "creditsUnrecovered",
      "originalAmount",
      "refundedAmount",
      "refundId",
      "createdAt"
    ) VALUES (
      ${randomUUID()},
      ${input.purchaseId},
      ${input.venueId},
      ${input.kind},
      ${input.creditsRecovered},
      ${input.creditsUnrecovered},
      ${input.originalAmount},
      ${input.refundedAmount},
      ${input.refundId},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("purchaseId", "kind") DO NOTHING
  `;
}

function moneyToCents(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  if (Math.abs(value * 100 - cents) > 1e-6) return null;
  return cents;
}

function moneyOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    const amount = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(amount) ? amount : null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
