import {
  planFullRefundShadow,
  planPixPartialMarkerShadow,
  settleGrantKey,
  type FullRefundShadowInput,
  type ShadowLedgerEntry,
  type ShadowObligationDraft,
  assertCreditInvariant,
} from './credit-ledger.shadow';

/**
 * The unexecuted migration now has composite foreign keys on
 * ("purchaseId", "venueId") and the other optional links. This layer still
 * rejects a mismatched purchase venue before insert. The in-memory store
 * does not execute those database constraints.
 */
export const CREDIT_LEDGER_VENUE_FK_GAP = 'purchase-venue-composite-fk';

export type CreditLedgerReason =
  | 'divergent'
  | 'venue_mismatch'
  | 'invariant'
  | 'missing_purchase'
  | 'partial'
  | 'missing_reference'
  | 'unresolved_reference';

export class CreditLedgerError extends Error {
  constructor(readonly reason: CreditLedgerReason) {
    super(reason);
  }
}

export type StoredObligation = ShadowObligationDraft & { id: string };

export type StoredLedgerEntry = {
  id: string;
  operationKey: string;
  venueId: string;
  purchaseId: string | null;
  obligationId: string | null;
  kind: string;
  credits: number;
  availableDelta: number;
  debtDelta: number;
};

/**
 * Caller-owned transaction. This module does not open another transaction
 * and does not touch CreditWallet.
 */
export interface CreditLedgerTx {
  lock(keys: string[]): Promise<void>;
  purchaseVenue(purchaseId: string): Promise<string | null>;
  findObligationByPurchase(purchaseId: string): Promise<StoredObligation | null>;
  findObligationById(id: string): Promise<StoredObligation | null>;
  findEntry(operationKey: string): Promise<StoredLedgerEntry | null>;
  insertObligation(row: StoredObligation): Promise<void>;
  insertEntry(row: StoredLedgerEntry): Promise<void>;
}

export type PersistStatus = 'inserted' | 'identical' | 'skipped';

export function creditLedgerLockKeys(venueId: string, purchaseId: string): string[] {
  return [`purchase:${purchaseId}`, `venue:${venueId}`].sort();
}

export function assertPersistableObligation(row: {
  creditsOriginal: number;
  creditsRecovered: number;
  creditsOpened: number;
  creditsSettled: number;
  status: 'open' | 'settled';
}): void {
  try {
    assertCreditInvariant({
      original: row.creditsOriginal,
      recovered: row.creditsRecovered,
      opened: row.creditsOpened,
      settled: row.creditsSettled,
    });
  } catch {
    throw new CreditLedgerError('invariant');
  }
  const balanced =
    (row.status === 'open' && row.creditsSettled < row.creditsOpened) ||
    (row.status === 'settled' && row.creditsSettled === row.creditsOpened);
  if (!balanced) throw new CreditLedgerError('invariant');
}

/**
 * Persists one planned full refund. Identical replay is not a second effect.
 * The same key with different credits, deltas, or venue is a hard conflict.
 */
export async function persistPlannedRefund(
  tx: CreditLedgerTx,
  input: FullRefundShadowInput,
  ids: () => string = defaultId,
): Promise<{ status: PersistStatus; obligationId: string | null }> {
  const planned = planFullRefundShadow(input);
  if (!planned.obligation && planned.entries.length === 0) {
    return { status: 'skipped', obligationId: null };
  }
  await tx.lock(creditLedgerLockKeys(input.venueId, input.purchaseId));
  await assertPurchaseVenue(tx, input.purchaseId, input.venueId);

  const existingObligation = planned.obligation
    ? await tx.findObligationByPurchase(input.purchaseId)
    : null;
  const existingEntries: Array<StoredLedgerEntry | null> = [];
  for (const entry of planned.entries) {
    existingEntries.push(await tx.findEntry(entry.operationKey));
  }

  if (existingObligation && planned.obligation && !sameObligation(existingObligation, planned.obligation)) {
    throw new CreditLedgerError('divergent');
  }
  planned.entries.forEach((entry, index) => {
    const existing = existingEntries[index];
    if (existing && !sameFinancialEntry(existing, entry)) {
      throw new CreditLedgerError('divergent');
    }
  });

  const found =
    existingEntries.filter((entry) => entry !== null).length + (existingObligation ? 1 : 0);
  const expected = planned.entries.length + (planned.obligation ? 1 : 0);
  if (found === expected) {
    return { status: 'identical', obligationId: existingObligation?.id ?? null };
  }
  if (found !== 0) throw new CreditLedgerError('partial');

  if (planned.obligation) assertPersistableObligation(planned.obligation);
  const obligationId = planned.obligation ? ids() : null;
  if (planned.obligation && obligationId) {
    await tx.insertObligation({ ...planned.obligation, id: obligationId });
  }
  for (const entry of planned.entries) {
    await tx.insertEntry({
      id: ids(),
      operationKey: entry.operationKey,
      venueId: entry.venueId,
      purchaseId: entry.purchaseId,
      obligationId: entry.kind === 'obligation_open' ? obligationId : null,
      kind: entry.kind,
      credits: entry.credits,
      availableDelta: entry.availableDelta,
      debtDelta: entry.debtDelta,
    });
  }
  return { status: 'inserted', obligationId };
}

/** Partial marker only. Zero deltas, no obligation, no wallet write. */
export async function persistPixPartialMarker(
  tx: CreditLedgerTx,
  input: { purchaseId: string; venueId: string },
  ids: () => string = defaultId,
): Promise<PersistStatus> {
  const entry = planPixPartialMarkerShadow(input);
  await tx.lock(creditLedgerLockKeys(input.venueId, input.purchaseId));
  await assertPurchaseVenue(tx, input.purchaseId, input.venueId);
  return persistComparableEntry(tx, entry, null, ids);
}

/**
 * Reserves a future compensation key. Does not change creditsSettled and
 * does not move the wallet. Not a settlement.
 */
export async function persistSettleReservation(
  tx: CreditLedgerTx,
  input: { obligationId: string; grantPurchaseId: string; venueId: string },
  ids: () => string = defaultId,
): Promise<PersistStatus> {
  await tx.lock(
    [`obligation:${input.obligationId}`, `venue:${input.venueId}`].sort(),
  );
  const obligation = await tx.findObligationById(input.obligationId);
  if (!obligation) throw new CreditLedgerError('missing_purchase');
  if (obligation.venueId !== input.venueId) throw new CreditLedgerError('venue_mismatch');
  const entry: LedgerDraft = {
    operationKey: settleGrantKey(input.obligationId, input.grantPurchaseId),
    venueId: input.venueId,
    purchaseId: null,
    kind: 'settle_reservation',
    credits: 0,
    availableDelta: 0,
    debtDelta: 0,
  };
  const status = await persistComparableEntry(tx, entry, input.obligationId, ids);
  const after = await tx.findObligationById(input.obligationId);
  if (!after || after.creditsSettled !== obligation.creditsSettled || after.status !== obligation.status) {
    throw new CreditLedgerError('invariant');
  }
  return status;
}

export async function persistComparableEntry(
  tx: CreditLedgerTx,
  entry: LedgerDraft,
  obligationId: string | null,
  ids: () => string = defaultId,
): Promise<PersistStatus> {
  if (!entry.operationKey.trim()) throw new CreditLedgerError('invariant');
  const existing = await tx.findEntry(entry.operationKey);
  if (existing) {
    if (!sameFinancialEntry(existing, entry) || existing.venueId !== entry.venueId) {
      throw new CreditLedgerError('divergent');
    }
    return 'identical';
  }
  await tx.insertEntry({
    id: ids(),
    operationKey: entry.operationKey,
    venueId: entry.venueId,
    purchaseId: entry.purchaseId,
    obligationId,
    kind: entry.kind,
    credits: entry.credits,
    availableDelta: entry.availableDelta,
    debtDelta: entry.debtDelta,
  });
  return 'inserted';
}

async function assertPurchaseVenue(
  tx: CreditLedgerTx,
  purchaseId: string,
  venueId: string,
): Promise<void> {
  const venue = await tx.purchaseVenue(purchaseId);
  if (!venue) throw new CreditLedgerError('missing_purchase');
  if (venue !== venueId) throw new CreditLedgerError('venue_mismatch');
}

function sameObligation(existing: StoredObligation, planned: ShadowObligationDraft): boolean {
  return (
    existing.purchaseId === planned.purchaseId &&
    existing.venueId === planned.venueId &&
    existing.creditsOriginal === planned.creditsOriginal &&
    existing.creditsRecovered === planned.creditsRecovered &&
    existing.creditsOpened === planned.creditsOpened &&
    existing.creditsSettled === planned.creditsSettled &&
    existing.status === planned.status &&
    existing.source === planned.source
  );
}

type LedgerDraft = {
  operationKey: string;
  venueId: string;
  purchaseId: string | null;
  kind: string;
  credits: number;
  availableDelta: number;
  debtDelta: number;
};

function sameFinancialEntry(existing: StoredLedgerEntry, planned: LedgerDraft): boolean {
  return (
    existing.operationKey === planned.operationKey &&
    existing.purchaseId === planned.purchaseId &&
    existing.kind === planned.kind &&
    existing.credits === planned.credits &&
    existing.availableDelta === planned.availableDelta &&
    existing.debtDelta === planned.debtDelta
  );
}

function defaultId(): string {
  return `row-${Math.random().toString(16).slice(2)}`;
}
