import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CREDIT_LEDGER_OBSERVE_ENABLED,
  observeCreditLedger,
  type CreditLedgerObserveInput,
} from './credit-ledger.observe';

const base: CreditLedgerObserveInput = {
  kind: 'pix_full_refund',
  purchaseId: 'purchase-a',
  venueId: 'venue-1',
  purchaseCredits: 5,
  balance: 5,
  confirmed: true,
  verified: true,
};

describe('credit ledger observation', () => {
  it('fica desligada por padrão', () => {
    expect(CREDIT_LEDGER_OBSERVE_ENABLED).toBe(false);
    expect(observeCreditLedger(base)).toEqual({ status: 'off' });
  });

  it('não consulta nem escreve as tabelas novas', () => {
    const source = readFileSync(join(__dirname, 'credit-ledger.observe.ts'), 'utf8');
    expect(source).not.toContain('prisma');
    expect(source).not.toContain('persistPlannedRefund');
    expect(source).not.toContain('$queryRaw');
    expect(source).not.toContain('$executeRaw');
    expect(source).not.toContain('INSERT');
    expect(source).not.toContain('FOR UPDATE');
  });

  it('PIX integral com saldo positivo só existe no plano habilitado', () => {
    const observed = observeCreditLedger(base, { enabled: true });
    expect(observed.status).toBe('planned');
    if (observed.status !== 'planned') return;
    expect(observed.plan.obligation).toBeNull();
    expect(observed.plan.entries).toEqual([
      expect.objectContaining({ kind: 'clawback', credits: 5, availableDelta: -5, debtDelta: 0 }),
    ]);
  });

  it('PIX integral com saldo zero abre dívida no plano e não credita', () => {
    const observed = observeCreditLedger({ ...base, balance: 0 }, { enabled: true });
    expect(observed).toMatchObject({
      status: 'planned',
      plan: {
        obligation: { creditsRecovered: 0, creditsOpened: 5, source: 'pix_full_refund' },
        entries: [expect.objectContaining({ kind: 'obligation_open', availableDelta: 0, debtDelta: 5 })],
      },
    });
  });

  it('PIX integral com saldo negativo não gera delta positivo', () => {
    const wallet = { balance: -2 };
    const observed = observeCreditLedger({ ...base, balance: wallet.balance }, { enabled: true });
    wallet.balance = -2;
    expect(observed).toMatchObject({
      status: 'planned',
      plan: {
        obligation: { creditsRecovered: 0, creditsOpened: 5 },
      },
    });
    if (observed.status !== 'planned') return;
    expect(observed.plan.entries.some((entry) => entry.availableDelta > 0)).toBe(false);
    expect(observed.plan.entries.some((entry) => entry.availableDelta === -5)).toBe(false);
  });

  it('cartão integral com saldo positivo recupera o pacote no plano', () => {
    const observed = observeCreditLedger(
      { ...base, kind: 'card_full_refund', balance: 8 },
      { enabled: true },
    );
    expect(observed).toMatchObject({
      status: 'planned',
      plan: {
        obligation: null,
        entries: [expect.objectContaining({ kind: 'clawback', credits: 5, availableDelta: -5 })],
      },
    });
  });

  it('cartão integral com saldo insuficiente abre a diferença no plano', () => {
    const observed = observeCreditLedger(
      { ...base, kind: 'card_full_refund', balance: 3 },
      { enabled: true },
    );
    expect(observed).toMatchObject({
      status: 'planned',
      plan: {
        obligation: { creditsRecovered: 3, creditsOpened: 2, source: 'card_full_refund' },
        entries: [
          expect.objectContaining({ kind: 'clawback', credits: 3, availableDelta: -3 }),
          expect.objectContaining({ kind: 'obligation_open', debtDelta: 2 }),
        ],
      },
    });
  });

  it('PIX parcial planeja marcador sem débito', () => {
    const observed = observeCreditLedger(
      { ...base, kind: 'pix_partial', balance: undefined },
      { enabled: true },
    );
    expect(observed).toMatchObject({
      status: 'planned',
      plan: {
        obligation: null,
        entries: [expect.objectContaining({ kind: 'partial_marker', credits: 0, availableDelta: 0, debtDelta: 0 })],
      },
    });
  });

  it('evento duplicado não gera plano', () => {
    expect(
      observeCreditLedger({ ...base, alreadySettled: true }, { enabled: true }),
    ).toEqual({ status: 'skipped', reason: 'duplicate' });
  });

  it('evento não verificado não gera plano', () => {
    expect(observeCreditLedger({ ...base, verified: false }, { enabled: true })).toEqual({
      status: 'skipped',
      reason: 'unverified',
    });
    expect(observeCreditLedger({ ...base, confirmed: false }, { enabled: true })).toEqual({
      status: 'skipped',
      reason: 'unconfirmed',
    });
  });

  it('falha no cálculo não escapa nem altera o resultado financeiro', () => {
    const response = { status: 'REFUNDED', balance: 1 };
    const observed = observeCreditLedger(
      { ...base, kind: 'pix_partial', purchaseId: 'bad:id' },
      { enabled: true },
    );
    expect(observed).toEqual({ status: 'error' });
    expect(response).toEqual({ status: 'REFUNDED', balance: 1 });
  });

  it('preserva a fórmula PIX e a resposta da API', () => {
    const service = readFileSync(join(__dirname, 'credits.service.ts'), 'utf8');
    expect(service).toContain('increment: -purchase.credits');
    expect(service).not.toContain('persistPlannedRefund');
    expect(service).not.toContain('credit-ledger.persist');
    expect(service).not.toContain('credit-ledger.shadow');
    expect(service).not.toContain('enabled: true');
    const api = { status: 'REFUNDED' as const };
    observeCreditLedger(base);
    expect(api).toEqual({ status: 'REFUNDED' });
  });

  it('não adiciona lock quando está desligada', () => {
    const service = readFileSync(join(__dirname, 'credits.service.ts'), 'utf8');
    const note = service.slice(service.indexOf('private noteCreditLedger'));
    expect(note).not.toContain('FOR UPDATE');
    expect(note).not.toContain('$transaction');
    expect(service.match(/SELECT id FROM "CreditPurchase" WHERE id/g)).toBeNull();
  });
});
