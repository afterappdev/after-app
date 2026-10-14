import { recoverableCardCredits } from './card-refund.ledger';

/**
 * In-memory draft of a future ledger row. Nothing here is written to
 * CreditLedgerEntry or CreditObligation.
 */
export type ShadowLedgerEntry = {
  operationKey: string;
  venueId: string;
  purchaseId: string | null;
  kind: 'clawback' | 'obligation_open' | 'partial_marker';
  credits: number;
  availableDelta: number;
  debtDelta: number;
};

export type ShadowObligationDraft = {
  purchaseId: string;
  venueId: string;
  creditsOriginal: number;
  creditsRecovered: number;
  creditsOpened: number;
  creditsSettled: number;
  status: 'open';
  source: 'pix_full_refund' | 'card_full_refund';
};

export type FullRefundShadow = {
  entries: ShadowLedgerEntry[];
  obligation: ShadowObligationDraft | null;
};

export type FullRefundShadowInput = {
  purchaseId: string;
  venueId: string;
  purchaseCredits: number;
  balance: number;
  source: 'pix_full_refund' | 'card_full_refund';
  /** A purchase already claimed as REFUNDED produces no second movement. */
  alreadySettled?: boolean;
};

/** Future rows are not inserted by this module. */
export const CREDIT_LEDGER_SHADOW_PERSISTS = false;

export function refundClawbackKey(purchaseId: string): string {
  return `refund:${operationId(purchaseId)}:clawback`;
}

export function refundObligationKey(purchaseId: string): string {
  return `refund:${operationId(purchaseId)}:obligation`;
}

export function partialMarkerKey(purchaseId: string): string {
  return `refund:${operationId(purchaseId)}:pix_partial_review`;
}

/** Identifies a future compensation. This module does not apply one. */
export function settleGrantKey(obligationId: string, grantPurchaseId: string): string {
  return `settle:${operationId(obligationId)}:grant:${operationId(grantPurchaseId)}`;
}

export function assertCreditInvariant(input: {
  original: number;
  recovered: number;
  opened: number;
  settled: number;
}): void {
  for (const value of [input.original, input.recovered, input.opened, input.settled]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('credit invariant');
    }
  }
  if (input.recovered > input.original) throw new Error('credit invariant');
  if (input.opened !== input.original - input.recovered) throw new Error('credit invariant');
  if (input.settled > input.opened) throw new Error('credit invariant');
}

export function assertUniqueOperationKeys(entries: readonly ShadowLedgerEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.operationKey) throw new Error('empty operation key');
    if (seen.has(entry.operationKey)) throw new Error('duplicate operation');
    seen.add(entry.operationKey);
  }
}

/**
 * Drops entries whose key was already accepted. A repeat is not a new movement.
 */
export function acceptShadowEntries(
  seen: Set<string>,
  entries: readonly ShadowLedgerEntry[],
): ShadowLedgerEntry[] {
  assertUniqueOperationKeys(entries);
  const fresh: ShadowLedgerEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.operationKey)) continue;
    seen.add(entry.operationKey);
    fresh.push(entry);
  }
  return fresh;
}

/**
 * Draft of a full-refund clawback and, when credits remain unrecovered, an
 * open obligation. Recovery uses the card floor: a negative balance contributes
 * nothing and is not increased. Callers must not treat this as a wallet write.
 */
export function planFullRefundShadow(input: FullRefundShadowInput): FullRefundShadow {
  operationId(input.purchaseId);
  operationId(input.venueId);
  if (input.alreadySettled) return { entries: [], obligation: null };
  if (!Number.isInteger(input.purchaseCredits) || input.purchaseCredits < 0) {
    throw new Error('credit invariant');
  }
  if (!Number.isInteger(input.balance)) throw new Error('credit invariant');

  const recovered = recoverableCardCredits(input.balance, input.purchaseCredits);
  const opened = input.purchaseCredits - recovered;
  assertCreditInvariant({
    original: input.purchaseCredits,
    recovered,
    opened,
    settled: 0,
  });

  const entries: ShadowLedgerEntry[] = [];
  if (recovered > 0) {
    entries.push({
      operationKey: refundClawbackKey(input.purchaseId),
      venueId: input.venueId,
      purchaseId: input.purchaseId,
      kind: 'clawback',
      credits: recovered,
      availableDelta: -recovered,
      debtDelta: 0,
    });
  }

  const obligation: ShadowObligationDraft | null =
    opened > 0
      ? {
          purchaseId: input.purchaseId,
          venueId: input.venueId,
          creditsOriginal: input.purchaseCredits,
          creditsRecovered: recovered,
          creditsOpened: opened,
          creditsSettled: 0,
          status: 'open',
          source: input.source,
        }
      : null;

  if (obligation) {
    entries.push({
      operationKey: refundObligationKey(input.purchaseId),
      venueId: input.venueId,
      purchaseId: input.purchaseId,
      kind: 'obligation_open',
      credits: opened,
      availableDelta: 0,
      debtDelta: opened,
    });
  }

  assertUniqueOperationKeys(entries);
  return { entries, obligation };
}

/** The partial marker is not a debit and does not open a debt. */
export function planPixPartialMarkerShadow(input: {
  purchaseId: string;
  venueId: string;
}): ShadowLedgerEntry {
  return {
    operationKey: partialMarkerKey(input.purchaseId),
    venueId: operationId(input.venueId),
    purchaseId: operationId(input.purchaseId),
    kind: 'partial_marker',
    credits: 0,
    availableDelta: 0,
    debtDelta: 0,
  };
}

function operationId(value: string): string {
  const id = value.trim();
  if (!id || id.includes(':')) throw new Error('empty operation id');
  return id;
}
