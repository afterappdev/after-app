import {
  planFullRefundShadow,
  planPixPartialMarkerShadow,
  type FullRefundShadow,
  type ShadowLedgerEntry,
} from './credit-ledger.shadow';

/**
 * Observational draft only. The source switch stays off, so active services
 * do not plan, persist, lock, or read the debt tables.
 * PIX still debits the whole package and can go negative. This draft uses the
 * zero floor and is not applied.
 */
export const CREDIT_LEDGER_OBSERVE_ENABLED = false;

export type CreditLedgerObserveInput = {
  kind: 'pix_full_refund' | 'card_full_refund' | 'pix_partial' | 'grant' | 'spend';
  purchaseId: string;
  venueId: string;
  purchaseCredits?: number;
  /** Balance already known to the caller. This module does not read a wallet. */
  balance?: number;
  confirmed?: boolean;
  verified?: boolean;
  alreadySettled?: boolean;
};

export type CreditLedgerObservation =
  | { status: 'off' }
  | { status: 'skipped'; reason: 'unconfirmed' | 'duplicate' | 'unverified' | 'not_a_refund' | 'balance_unavailable' }
  | { status: 'planned'; plan: FullRefundShadow | { entries: ShadowLedgerEntry[]; obligation: null } }
  | { status: 'error' };

export function observeCreditLedger(
  input: CreditLedgerObserveInput,
  options?: { enabled?: boolean },
): CreditLedgerObservation {
  try {
    if (options?.enabled !== true && !CREDIT_LEDGER_OBSERVE_ENABLED) {
      return { status: 'off' };
    }
    if (input.confirmed !== true) return { status: 'skipped', reason: 'unconfirmed' };
    if (input.verified === false) return { status: 'skipped', reason: 'unverified' };
    if (input.alreadySettled) return { status: 'skipped', reason: 'duplicate' };
    if (input.kind === 'grant' || input.kind === 'spend') {
      return { status: 'skipped', reason: 'not_a_refund' };
    }
    if (input.kind === 'pix_partial') {
      return {
        status: 'planned',
        plan: {
          entries: [planPixPartialMarkerShadow(input)],
          obligation: null,
        },
      };
    }
    const credits = input.purchaseCredits;
    const balance = input.balance;
    if (typeof credits !== 'number' || typeof balance !== 'number') {
      return { status: 'skipped', reason: 'balance_unavailable' };
    }
    if (!Number.isInteger(credits) || !Number.isInteger(balance)) {
      return { status: 'skipped', reason: 'balance_unavailable' };
    }
    const plan = planFullRefundShadow({
      purchaseId: input.purchaseId,
      venueId: input.venueId,
      purchaseCredits: credits,
      balance,
      source: input.kind,
      alreadySettled: false,
    });
    if (!plan.obligation && plan.entries.length === 0) {
      return { status: 'skipped', reason: 'duplicate' };
    }
    return { status: 'planned', plan };
  } catch {
    return { status: 'error' };
  }
}
