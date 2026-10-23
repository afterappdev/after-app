import {
  CreditLedgerError,
  type CreditLedgerTx,
  type StoredLedgerEntry,
  type StoredObligation,
} from './credit-ledger.persist';

/**
 * In-memory transaction for the isolated ledger. It is not a database and
 * it has no wallet balance. Locks are taken in sorted key order and held
 * until the transaction commits or rolls back. There is no automatic retry.
 */
export class MemoryCreditLedger {
  readonly obligations = new Map<string, StoredObligation>();
  readonly entries = new Map<string, StoredLedgerEntry>();
  readonly purchaseVenues = new Map<string, string>();
  readonly lockLog: string[][] = [];
  failAt: 'before' | 'after-obligation' | 'during-entry' | null = null;
  private tails = new Map<string, Promise<void>>();
  private obligationsById = new Map<string, StoredObligation>();

  seedPurchase(purchaseId: string, venueId: string): void {
    this.purchaseVenues.set(purchaseId, venueId);
  }

  /** Test-only torn row. A later persist must not treat it as success. */
  seedObligation(row: StoredObligation): void {
    this.obligations.set(row.purchaseId, row);
    this.obligationsById.set(row.id, row);
  }

  async transaction<T>(run: (tx: CreditLedgerTx) => Promise<T>): Promise<T> {
    const stagedObligations: StoredObligation[] = [];
    const stagedEntries: StoredLedgerEntry[] = [];
    let release: (() => void) | undefined;
    const tx: CreditLedgerTx = {
      lock: async (keys: string[]) => {
        const ordered = [...new Set(keys)].sort();
        this.lockLog.push(ordered);
        release = await this.acquire(ordered);
      },
      purchaseVenue: async (purchaseId) => this.purchaseVenues.get(purchaseId) ?? null,
      findObligationByPurchase: async (purchaseId) =>
        stagedObligations.find((row) => row.purchaseId === purchaseId) ??
        this.obligations.get(purchaseId) ??
        null,
      findObligationById: async (id) =>
        stagedObligations.find((row) => row.id === id) ?? this.obligationsById.get(id) ?? null,
      findEntry: async (operationKey) =>
        stagedEntries.find((row) => row.operationKey === operationKey) ??
        this.entries.get(operationKey) ??
        null,
      insertObligation: async (row) => {
        if (this.failAt === 'before') throw new Error('injected');
        this.assertFreshObligation(row, stagedObligations);
        stagedObligations.push(row);
        if (this.failAt === 'after-obligation') throw new Error('injected');
      },
      insertEntry: async (row) => {
        if (this.failAt === 'during-entry') throw new Error('injected');
        this.assertFreshEntry(row, stagedEntries);
        stagedEntries.push(row);
      },
    };
    try {
      const value = await run(tx);
      this.apply(stagedObligations, stagedEntries);
      return value;
    } finally {
      release?.();
    }
  }

  private apply(obligations: StoredObligation[], entries: StoredLedgerEntry[]): void {
    for (const row of obligations) {
      const existing = this.obligations.get(row.purchaseId);
      if (existing && !sameId(existing.id, row.id)) {
        throw new CreditLedgerError('divergent');
      }
    }
    for (const row of entries) {
      const existing = this.entries.get(row.operationKey);
      if (
        existing &&
        (existing.credits !== row.credits ||
          existing.availableDelta !== row.availableDelta ||
          existing.debtDelta !== row.debtDelta ||
          existing.venueId !== row.venueId)
      ) {
        throw new CreditLedgerError('divergent');
      }
    }
    for (const row of obligations) {
      if (!this.obligations.has(row.purchaseId)) {
        this.obligations.set(row.purchaseId, row);
        this.obligationsById.set(row.id, row);
      }
    }
    for (const row of entries) {
      if (!this.entries.has(row.operationKey)) this.entries.set(row.operationKey, row);
    }
  }

  private assertFreshObligation(row: StoredObligation, staged: StoredObligation[]): void {
    if (staged.some((item) => item.purchaseId === row.purchaseId)) {
      throw new CreditLedgerError('divergent');
    }
  }

  private assertFreshEntry(row: StoredLedgerEntry, staged: StoredLedgerEntry[]): void {
    if (staged.some((item) => item.operationKey === row.operationKey)) {
      throw new CreditLedgerError('divergent');
    }
  }

  private async acquire(keys: string[]): Promise<() => void> {
    const releases: Array<() => void> = [];
    for (const key of keys) releases.push(await this.acquireOne(key));
    return () => {
      for (const unlock of [...releases].reverse()) unlock();
    };
  }

  private acquireOne(key: string): Promise<() => void> {
    let unlock: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const previous = this.tails.get(key) ?? Promise.resolve();
    this.tails.set(
      key,
      previous.then(() => gate),
    );
    return previous.then(() => unlock);
  }
}

function sameId(left: string, right: string): boolean {
  return left === right;
}
