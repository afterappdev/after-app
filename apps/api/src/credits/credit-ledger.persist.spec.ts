import { readFileSync } from 'fs';
import { join } from 'path';
import { MemoryCreditLedger } from './credit-ledger.memory';
import {
  CREDIT_LEDGER_VENUE_FK_GAP,
  CreditLedgerError,
  assertPersistableObligation,
  creditLedgerLockKeys,
  persistComparableEntry,
  persistPixPartialMarker,
  persistPlannedRefund,
  persistSettleReservation,
} from './credit-ledger.persist';
import { refundClawbackKey, settleGrantKey } from './credit-ledger.shadow';

const venueId = 'venue-1';
const purchaseId = 'purchase-a';

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function input(balance: number, purchaseCredits = 5, purchase = purchaseId) {
  return {
    purchaseId: purchase,
    venueId,
    purchaseCredits,
    balance,
    source: 'pix_full_refund' as const,
  };
}

function storeFor(...purchases: string[]) {
  const store = new MemoryCreditLedger();
  for (const purchase of purchases) store.seedPurchase(purchase, venueId);
  return store;
}

async function refund(
  store: MemoryCreditLedger,
  balance: number,
  purchase = purchaseId,
  credits = 5,
) {
  const nextId = ids();
  return store.transaction((tx) =>
    persistPlannedRefund(tx, input(balance, credits, purchase), nextId),
  );
}

describe('credit ledger persistence', () => {
  it('grava obrigação e lançamento quando o saldo não cobre o pacote', async () => {
    const store = storeFor(purchaseId);
    const wallet = { balance: 3 };
    const result = await refund(store, wallet.balance);
    expect(result.status).toBe('inserted');
    expect(wallet.balance).toBe(3);
    expect(store.obligations.get(purchaseId)).toMatchObject({
      creditsOriginal: 5,
      creditsRecovered: 3,
      creditsOpened: 2,
      creditsSettled: 0,
      status: 'open',
      venueId,
    });
    expect(deltas(store)).toEqual({ available: -3, debt: 2 });
  });

  it('repetição idêntica não cria outra linha', async () => {
    const store = storeFor(purchaseId);
    await refund(store, 10);
    const again = await refund(store, 10);
    expect(again.status).toBe('identical');
    expect(store.obligations.size).toBe(0);
    expect(store.entries.size).toBe(1);
    expect(store.entries.get(refundClawbackKey(purchaseId))?.credits).toBe(5);
  });

  it('repetição com payload diferente é conflito', async () => {
    const store = storeFor(purchaseId);
    await refund(store, 3);
    await expect(refund(store, 1)).rejects.toMatchObject({ reason: 'divergent' });
    expect(store.obligations.get(purchaseId)?.creditsRecovered).toBe(3);
    expect(store.entries.size).toBe(2);
  });

  it('não completa uma obrigação que ficou sem o lançamento', async () => {
    const store = storeFor(purchaseId);
    store.seedObligation({
      id: 'torn',
      purchaseId,
      venueId,
      creditsOriginal: 5,
      creditsRecovered: 3,
      creditsOpened: 2,
      creditsSettled: 0,
      status: 'open',
      source: 'pix_full_refund',
    });
    await expect(refund(store, 3)).rejects.toMatchObject({ reason: 'partial' });
    expect(store.entries.size).toBe(0);
  });

  it('falha antes, no meio ou no lançamento desfaz a transação', async () => {
    for (const failAt of ['before', 'after-obligation', 'during-entry'] as const) {
      const store = storeFor(purchaseId);
      store.failAt = failAt;
      await expect(refund(store, 3)).rejects.toThrow('injected');
      expect(store.obligations.size).toBe(0);
      expect(store.entries.size).toBe(0);
      store.failAt = null;
      await refund(store, 3);
      expect(store.obligations.size).toBe(1);
      await refund(store, 3);
      expect(store.entries.size).toBe(2);
    }
  });

  it('serializa a mesma compra e aceita compras diferentes', async () => {
    const store = storeFor(purchaseId, 'purchase-b');
    const same = await Promise.all([refund(store, 0), refund(store, 0)]);
    expect(same.map((item) => item.status).sort()).toEqual(['identical', 'inserted']);
    expect(store.obligations.size).toBe(1);

    const other = new MemoryCreditLedger();
    other.seedPurchase(purchaseId, venueId);
    other.seedPurchase('purchase-b', venueId);
    await Promise.all([refund(other, 4, purchaseId), refund(other, 1, 'purchase-b')]);
    expect(other.obligations.size).toBe(2);
    expect(store.lockLog.every((keys) => keys.join() === [...keys].sort().join())).toBe(true);
  });

  it('não entra em deadlock com locks ordenados', async () => {
    const store = storeFor(purchaseId, 'purchase-b');
    const raced = Promise.all([
      refund(store, 5, purchaseId),
      refund(store, 5, 'purchase-b'),
    ]);
    await expect(withTimeout(raced)).resolves.toHaveLength(2);
    expect(creditLedgerLockKeys(venueId, purchaseId)).toEqual(
      [...creditLedgerLockKeys(venueId, purchaseId)].sort(),
    );
  });

  it('a mesma operationKey divergente não é tratada como repetição', async () => {
    const store = storeFor(purchaseId);
    const entry = {
      operationKey: refundClawbackKey(purchaseId),
      venueId,
      purchaseId,
      kind: 'clawback',
      credits: 5,
      availableDelta: -5,
      debtDelta: 0,
    };
    await store.transaction((tx) => persistComparableEntry(tx, entry, null, ids()));
    await expect(
      store.transaction((tx) =>
        persistComparableEntry(tx, { ...entry, credits: 4, availableDelta: -4 }, null, ids()),
      ),
    ).rejects.toMatchObject({ reason: 'divergent' });
    expect(store.entries.size).toBe(1);
  });

  it('reserva de compensação concorrente não baixa a dívida', async () => {
    const store = storeFor(purchaseId);
    const created = await refund(store, 0);
    const obligationId = created.obligationId as string;
    const settledBefore = store.obligations.get(purchaseId)?.creditsSettled;
    const [first, second, other] = await Promise.all([
      store.transaction((tx) =>
        persistSettleReservation(tx, { obligationId, grantPurchaseId: 'grant-1', venueId }, ids()),
      ),
      store.transaction((tx) =>
        persistSettleReservation(tx, { obligationId, grantPurchaseId: 'grant-1', venueId }, ids()),
      ),
      store.transaction((tx) =>
        persistSettleReservation(tx, { obligationId, grantPurchaseId: 'grant-2', venueId }, ids()),
      ),
    ]);
    expect([first, second].sort()).toEqual(['identical', 'inserted']);
    expect(other).toBe('inserted');
    expect(store.entries.has(settleGrantKey(obligationId, 'grant-1'))).toBe(true);
    expect(store.entries.has(settleGrantKey(obligationId, 'grant-2'))).toBe(true);
    expect(store.obligations.get(purchaseId)?.creditsSettled).toBe(settledBefore);
    expect(store.obligations.get(purchaseId)?.status).toBe('open');
  });

  it('rejeita valores, vínculos e estados inválidos', () => {
    expect(() =>
      assertPersistableObligation({
        creditsOriginal: -1,
        creditsRecovered: 0,
        creditsOpened: 0,
        creditsSettled: 0,
        status: 'settled',
      }),
    ).toThrow(CreditLedgerError);
    expect(() =>
      assertPersistableObligation({
        creditsOriginal: 5,
        creditsRecovered: 6,
        creditsOpened: 0,
        creditsSettled: 0,
        status: 'settled',
      }),
    ).toThrow(CreditLedgerError);
    expect(() =>
      assertPersistableObligation({
        creditsOriginal: 5,
        creditsRecovered: 3,
        creditsOpened: 2,
        creditsSettled: 3,
        status: 'open',
      }),
    ).toThrow(CreditLedgerError);
    expect(CREDIT_LEDGER_VENUE_FK_GAP).toBe('purchase-venue-composite-fk');
  });

  it('não grava em estabelecimento diferente nem em compra ausente', async () => {
    const store = storeFor(purchaseId);
    await expect(
      store.transaction((tx) =>
        persistPlannedRefund(
          tx,
          { ...input(3), venueId: 'venue-2' },
          ids(),
        ),
      ),
    ).rejects.toMatchObject({ reason: 'venue_mismatch' });
    const missing = new MemoryCreditLedger();
    await expect(refund(missing, 3)).rejects.toMatchObject({ reason: 'missing_purchase' });
    expect(store.obligations.size).toBe(0);
    expect(missing.entries.size).toBe(0);
  });

  it('marcador parcial não debita e o integral seguinte permanece o do pacote', async () => {
    const store = storeFor(purchaseId);
    const wallet = { balance: 5 };
    await store.transaction((tx) => persistPixPartialMarker(tx, { purchaseId, venueId }, ids()));
    await refund(store, wallet.balance);
    expect(wallet.balance).toBe(5);
    const marker = [...store.entries.values()].find((entry) => entry.kind === 'partial_marker');
    expect(marker).toMatchObject({ availableDelta: 0, debtDelta: 0, credits: 0 });
    expect(store.entries.get(refundClawbackKey(purchaseId))?.credits).toBe(5);
    expect(store.obligations.size).toBe(0);
  });

  it('saldo zero ou negativo não gera delta positivo nem mexe na carteira', async () => {
    for (const balance of [0, -2]) {
      const store = storeFor(purchaseId);
      const wallet = { balance };
      await refund(store, wallet.balance);
      expect(wallet.balance).toBe(balance);
      expect([...store.entries.values()].some((entry) => entry.availableDelta > 0)).toBe(false);
      expect(store.obligations.get(purchaseId)).toMatchObject({
        creditsRecovered: 0,
        creditsOpened: 5,
      });
    }
  });

  it('não é importado pelos fluxos ativos e não escreve carteira nem shortfall', () => {
    const root = join(__dirname, '..', '..');
    const persist = readFileSync(join(__dirname, 'credit-ledger.persist.ts'), 'utf8');
    expect(persist).not.toContain('creditWallet');
    expect(persist).not.toContain('shortfall');
    expect(persist).not.toContain('$transaction');
    expect(persist).not.toContain('prisma');
    for (const file of [
      'src/credits/credits.service.ts',
      'src/credits/card-refund.ledger.ts',
      'src/credits/providers/pix.provider.ts',
      'src/banners/banners.service.ts',
      'src/coupons/coupons.service.ts',
      'src/app.module.ts',
    ]) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source).not.toContain('credit-ledger.persist');
      expect(source).not.toContain('credit-ledger.memory');
    }
  });
});

function deltas(store: MemoryCreditLedger) {
  let available = 0;
  let debt = 0;
  for (const entry of store.entries.values()) {
    available += entry.availableDelta;
    debt += entry.debtDelta;
  }
  return { available, debt };
}

function withTimeout<T>(promise: Promise<T>, ms = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('deadlock')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
