import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CREDIT_LEDGER_SHADOW_PERSISTS,
  acceptShadowEntries,
  assertCreditInvariant,
  assertUniqueOperationKeys,
  partialMarkerKey,
  planFullRefundShadow,
  planPixPartialMarkerShadow,
  refundClawbackKey,
  refundObligationKey,
  settleGrantKey,
  type ShadowLedgerEntry,
} from './credit-ledger.shadow';

const venueId = 'venue-1';

function plan(balance: number, purchaseCredits: number, purchaseId = 'purchase-a') {
  return planFullRefundShadow({
    purchaseId,
    venueId,
    purchaseCredits,
    balance,
    source: 'pix_full_refund',
  });
}

function deltas(entries: readonly ShadowLedgerEntry[]) {
  return entries.reduce(
    (sum, entry) => ({
      available: sum.available + entry.availableDelta,
      debt: sum.debt + entry.debtDelta,
    }),
    { available: 0, debt: 0 },
  );
}

describe('credit ledger shadow', () => {
  it('reembolso com saldo suficiente só recupera o pacote', () => {
    const draft = plan(10, 5);
    expect(draft.obligation).toBeNull();
    expect(deltas(draft.entries)).toEqual({ available: -5, debt: 0 });
    expect(draft.entries.map((entry) => entry.operationKey)).toEqual([
      'refund:purchase-a:clawback',
    ]);
  });

  it('reembolso com saldo insuficiente abre a diferença como dívida', () => {
    const draft = plan(3, 5);
    expect(draft.obligation).toMatchObject({
      creditsOriginal: 5,
      creditsRecovered: 3,
      creditsOpened: 2,
      creditsSettled: 0,
      status: 'open',
    });
    expect(deltas(draft.entries)).toEqual({ available: -3, debt: 2 });
  });

  it('reembolso com saldo zero não debita e abre a dívida do pacote', () => {
    const draft = plan(0, 5);
    expect(deltas(draft.entries)).toEqual({ available: 0, debt: 5 });
    expect(draft.entries.every((entry) => entry.availableDelta <= 0)).toBe(true);
  });

  it('reembolso com saldo negativo não aumenta o saldo', () => {
    const draft = plan(-2, 5);
    expect(deltas(draft.entries)).toEqual({ available: 0, debt: 5 });
    expect(draft.entries.some((entry) => entry.availableDelta > 0)).toBe(false);
    expect(draft.obligation?.creditsRecovered).toBe(0);
  });

  it('reembolso duplicado não cria outro movimento', () => {
    const first = plan(5, 5);
    const repeat = planFullRefundShadow({
      purchaseId: 'purchase-a',
      venueId,
      purchaseCredits: 5,
      balance: 0,
      source: 'card_full_refund',
      alreadySettled: true,
    });
    const seen = new Set<string>();
    expect(acceptShadowEntries(seen, first.entries)).toHaveLength(1);
    expect(acceptShadowEntries(seen, first.entries)).toEqual([]);
    expect(repeat.entries).toEqual([]);
    expect(repeat.obligation).toBeNull();
  });

  it('compras diferentes geram chaves diferentes', () => {
    const left = plan(4, 5, 'purchase-a');
    const right = plan(4, 5, 'purchase-b');
    const seen = new Set<string>();
    const accepted = [
      ...acceptShadowEntries(seen, left.entries),
      ...acceptShadowEntries(seen, right.entries),
    ];
    expect(accepted).toHaveLength(4);
    expect(new Set(accepted.map((entry) => entry.operationKey)).size).toBe(4);
  });

  it('marcador parcial não debita e o integral seguinte usa o pacote inteiro', () => {
    const marker = planPixPartialMarkerShadow({ purchaseId: 'purchase-a', venueId });
    const full = plan(5, 5);
    expect(marker).toMatchObject({
      operationKey: 'refund:purchase-a:pix_partial_review',
      availableDelta: 0,
      debtDelta: 0,
      credits: 0,
    });
    expect(marker.operationKey).not.toBe(refundClawbackKey('purchase-a'));
    expect(deltas(full.entries)).toEqual({ available: -5, debt: 0 });
  });

  it('operationKey é determinística e a compensação futura tem chave própria', () => {
    expect(refundClawbackKey('purchase-a')).toBe(refundClawbackKey('purchase-a'));
    expect(refundObligationKey('purchase-a')).toBe('refund:purchase-a:obligation');
    expect(partialMarkerKey('purchase-a')).toBe('refund:purchase-a:pix_partial_review');
    expect(settleGrantKey('obligation-1', 'purchase-b')).toBe(
      'settle:obligation-1:grant:purchase-b',
    );
    expect(settleGrantKey('obligation-1', 'purchase-b')).not.toBe(
      settleGrantKey('obligation-1', 'purchase-c'),
    );
    expect(settleGrantKey('obligation-2', 'purchase-b')).not.toBe(
      refundClawbackKey('purchase-b'),
    );
    expect(() => refundClawbackKey('')).toThrow('empty operation id');
    expect(() => settleGrantKey('obligation-1', '  ')).toThrow('empty operation id');
  });

  it('rejeita recuperação acima do pacote, dívida incoerente e chave repetida', () => {
    expect(() =>
      assertCreditInvariant({ original: 5, recovered: 6, opened: 0, settled: 0 }),
    ).toThrow('credit invariant');
    expect(() =>
      assertCreditInvariant({ original: 5, recovered: -1, opened: 6, settled: 0 }),
    ).toThrow('credit invariant');
    expect(() =>
      assertCreditInvariant({ original: 5, recovered: 3, opened: 1, settled: 0 }),
    ).toThrow('credit invariant');
    expect(() =>
      assertCreditInvariant({ original: 5, recovered: 3, opened: 2, settled: 3 }),
    ).toThrow('credit invariant');
    const entry = plan(5, 5).entries[0];
    expect(() => assertUniqueOperationKeys([entry, entry])).toThrow('duplicate operation');
    expect(() =>
      assertUniqueOperationKeys([{ ...entry, operationKey: '' }]),
    ).toThrow('empty operation key');
  });

  it('não persiste lançamento nem é chamada pelos serviços ativos', () => {
    expect(CREDIT_LEDGER_SHADOW_PERSISTS).toBe(false);
    const source = readFileSync(join(__dirname, 'credit-ledger.shadow.ts'), 'utf8');
    expect(source).not.toContain('prisma');
    expect(source).not.toContain('$executeRaw');
    expect(source).not.toContain('$queryRaw');
    const root = join(__dirname, '..', '..');
    for (const file of [
      'src/credits/credits.service.ts',
      'src/credits/card-refund.ledger.ts',
      'src/credits/providers/pix.provider.ts',
      'src/banners/banners.service.ts',
      'src/coupons/coupons.service.ts',
    ]) {
      expect(readFileSync(join(root, file), 'utf8')).not.toContain('credit-ledger.shadow');
    }
  });
});
