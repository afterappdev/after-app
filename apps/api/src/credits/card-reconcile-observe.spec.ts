import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CARD_OBSERVE_EXPECTED_SELLER_ID,
  CardObserveDb,
  CardObserveEnv,
  CardObserveHttp,
  CardObservePurchase,
  CardObserveStopped,
  observeCardReconciliation,
  parseObservePurchaseId,
} from './card-reconcile-observe';
import { MercadoPagoOrdersClient, MercadoPagoTimeoutError } from './providers/mercado-pago-orders';

const PURCHASE = 'cpc38f88539ccc74d39acf2cc9f850618a';
const ORDER = 'ORDTST01M4E6EXHVH5Y61QC7NNYJXDAY';
const PAYMENT = 'PAY01M4E6EXJAS3HVZRYSEGKDN0VC';
const TOKEN = 'APP_USR-observe-test-token';
const DATABASE_URL = 'postgresql://observer:secret@localhost:5432/after';

function purchase(overrides: Partial<CardObservePurchase> = {}): CardObservePurchase {
  return {
    id: PURCHASE,
    status: 'PAID',
    amountPaid: '34.90',
    currency: 'BRL',
    credits: 1,
    provider: 'card',
    providerTxId: `card:${ORDER}`,
    confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    updatedAt: new Date('2026-10-08T16:45:08.551Z'),
    venueName: 'teste',
    balance: 3,
    walletUpdatedAt: new Date('2026-10-08T16:45:08.599Z'),
    auditCount: 0,
    ...overrides,
  };
}

function baseEnv(overrides: Partial<CardObserveEnv> = {}): CardObserveEnv {
  return {
    databaseUrl: DATABASE_URL,
    sandbox: true,
    production: false,
    reconcileEnabled: false,
    accessToken: TOKEN,
    ...overrides,
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT,
    status: 'processed',
    status_detail: 'accredited',
    amount: '34.90',
    paid_amount: '34.90',
    payment_method: { id: 'visa', type: 'credit_card', installments: 1 },
    ...overrides,
  };
}

function paidOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER,
    status: 'processed',
    status_detail: 'accredited',
    external_reference: PURCHASE,
    currency: 'BRL',
    total_amount: '34.90',
    transactions: { payments: [payment()] },
    ...overrides,
  };
}

function fullOrder(overrides: Record<string, unknown> = {}, pay: Record<string, unknown> = {}) {
  return paidOrder({
    status: 'refunded',
    status_detail: 'refunded',
    transactions: {
      payments: [payment({ status: 'refunded', status_detail: 'refunded', ...pay })],
      refunds: [
        {
          id: 'REF-FULL',
          status: 'processed',
          amount: '34.90',
          transaction_id: PAYMENT,
        },
      ],
    },
    ...overrides,
  });
}

type Calls = { server: number; purchase: number; lock: number; me: number; order: number };

function harness(
  row: CardObservePurchase | null,
  server = { name: 'after', addr: '::1/128', port: 5432 },
) {
  const calls: Calls = { server: 0, purchase: 0, lock: 0, me: 0, order: 0 };
  let respond = async (): Promise<{ status: number; data: unknown; retryAfter?: string | null }> => ({
    status: 200,
    data: paidOrder(),
  });
  const db = new Proxy(
    {
      async server() {
        calls.server += 1;
        return server;
      },
      async purchase() {
        calls.purchase += 1;
        return row;
      },
      async lock() {
        calls.lock += 1;
        return {
          held: false,
          cursorPurchaseId: null,
          cooldownUntil: null,
          lockedUntil: new Date(0),
        };
      },
    },
    {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        throw new Error(`escrita proibida: ${String(prop)}`);
      },
    },
  ) as CardObserveDb;
  const http: CardObserveHttp = {
    async getCurrentUser() {
      calls.me += 1;
      return { status: 200, data: { id: Number(CARD_OBSERVE_EXPECTED_SELLER_ID), tags: ['test_user'] } };
    },
    async getOrder() {
      calls.order += 1;
      return respond();
    },
  };
  return {
    db,
    http,
    calls,
    setOrder(fn: typeof respond) {
      respond = fn;
    },
  };
}

async function run(
  row: CardObservePurchase | null,
  orderData?: unknown,
  env: CardObserveEnv = baseEnv(),
  server?: { name: string; addr: string | null; port: number },
) {
  const setup = harness(row, server);
  if (orderData) {
    setup.setOrder(async () => ({ status: 200, data: orderData }));
  }
  const before = row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null;
  const report = await observeCardReconciliation({
    purchaseId: PURCHASE,
    env,
    db: setup.db,
    http: setup.http,
  });
  if (row && before) {
    expect(row.status).toBe(before.status);
    expect(row.updatedAt.toISOString()).toBe(before.updatedAt);
    expect(row.balance).toBe(before.balance);
    expect(row.auditCount).toBe(before.auditCount);
  }
  expect(JSON.stringify(report)).not.toContain(TOKEN);
  expect(JSON.stringify(report)).not.toContain('secret');
  return { report, calls: setup.calls, setup };
}

describe('observação da reconciliação de cartão', () => {
  it('rejeita lista, curingas e mais de uma compra', () => {
    expect(parseObservePurchaseId(['node', 'script', PURCHASE])).toBe(PURCHASE);
    expect(() => parseObservePurchaseId(['node', 'script'])).toThrow(CardObserveStopped);
    expect(() => parseObservePurchaseId(['node', 'script', PURCHASE, 'outra'])).toThrow(
      CardObserveStopped,
    );
    expect(() => parseObservePurchaseId(['node', 'script', 'all'])).toThrow(CardObserveStopped);
    expect(() => parseObservePurchaseId(['node', 'script', '*'])).toThrow(CardObserveStopped);
  });

  it('ordem paga sem reembolso manteria PAID', async () => {
    const { report, calls } = await run(purchase(), paidOrder());
    expect(report.ok).toBe(true);
    expect(report.eligible).toBe(true);
    expect(report.order).toMatchObject({ id: ORDER, status: 'processed', statusDetail: 'accredited' });
    expect(report.payment).toMatchObject({ id: PAYMENT, status: 'processed' });
    expect(report.refunds).toEqual([]);
    expect(report.processedRefundBrl).toBe(0);
    expect(report.assessment).toMatchObject({ refundScope: 'none', refundedAmountBrl: null });
    expect(report.refundAction).toBe('confirm');
    expect(report.hypothetical).toMatchObject({
      settlement: 'none',
      label: 'Manter PAID',
      wouldChangeStatus: false,
      wouldWriteAudit: false,
      wouldDebitCredits: false,
      projectedDebit: 0,
    });
    expect(calls.order).toBe(1);
    expect(calls.me).toBe(1);
  });

  it('reembolso parcial registraria auditoria e manteria o saldo', async () => {
    const data = paidOrder({
      status_detail: 'partially_refunded',
      transactions: {
        payments: [payment({ status_detail: 'partially_refunded' })],
        refunds: [{ id: 'REF10', status: 'processed', amount: '10.00', transaction_id: PAYMENT }],
      },
    });
    const { report } = await run(purchase(), data);
    expect(report.assessment).toMatchObject({ refundScope: 'partial', refundedAmountBrl: 10 });
    expect(report.refundAction).toBe('partial');
    expect(report.processedRefundBrl).toBe(10);
    expect(report.hypothetical).toMatchObject({
      label: 'Registrar parcial',
      wouldChangeStatus: false,
      wouldWriteAudit: true,
      wouldDebitCredits: false,
    });
    expect(report.purchase.status).toBe('PAID');
    expect(report.purchase.balance).toBe(3);
  });

  it('reembolso integral marcaria REFUNDED e projetaria o débito', async () => {
    const { report } = await run(purchase(), fullOrder());
    expect(report.assessment?.refundScope).toBe('full');
    expect(report.refundAction).toBe('full');
    expect(report.processedRefundBrl).toBe(34.9);
    expect(report.hypothetical).toMatchObject({
      settlement: 'full',
      label: 'Marcar REFUNDED e recuperar créditos',
      wouldChangeStatus: true,
      wouldDebitCredits: true,
      projectedDebit: 1,
      projectedShortfall: 0,
    });
  });

  it('resposta inconsistente registra revisão e não debita', async () => {
    const data = paidOrder({
      status: 'refunded',
      status_detail: 'refunded',
      transactions: {
        payments: [payment({ status: 'processed', status_detail: 'partially_refunded' })],
      },
    });
    const { report } = await run(purchase(), data);
    expect(report.assessment?.refundScope).toBe('review');
    expect(report.refundAction).toBe('review');
    expect(report.hypothetical).toMatchObject({
      label: 'Registrar revisão',
      wouldChangeStatus: false,
      wouldDebitCredits: false,
      wouldWriteAudit: true,
    });
  });

  it('review com referência divergente não registra auditoria', async () => {
    const data = paidOrder({
      status: 'refunded',
      status_detail: 'refunded',
      external_reference: 'outra-compra',
      transactions: {
        payments: [payment({ status: 'processed', status_detail: 'partially_refunded' })],
      },
    });
    const { report } = await run(purchase(), data);
    expect(report.assessment?.refundScope).toBe('review');
    expect(report.refundAction).toBe('review');
    expect(report.divergences).toContain('external_reference');
    expect(report.hypothetical).toMatchObject({
      settlement: 'none',
      label: 'Não liquidar',
      wouldWriteAudit: false,
      wouldDebitCredits: false,
      wouldChangeStatus: false,
    });
  });

  it('referência externa divergente não liquida um estorno integral', async () => {
    const { report } = await run(purchase(), fullOrder({ external_reference: 'outra-compra' }));
    expect(report.divergences).toContain('external_reference');
    expect(report.matchesPurchase).toBe(false);
    expect(report.hypothetical).toMatchObject({
      settlement: 'none',
      label: 'Não liquidar',
      wouldDebitCredits: false,
      wouldChangeStatus: false,
    });
  });

  it('pagamento divergente não liquida um estorno integral', async () => {
    const { report } = await run(
      purchase(),
      fullOrder({}, { payment_method: { id: 'visa', type: 'debit_card', installments: 1 } }),
    );
    expect(report.divergences).toContain('payment_type');
    expect(report.hypothetical.wouldDebitCredits).toBe(false);
    expect(report.hypothetical.label).toBe('Não liquidar');
  });

  it('valor divergente não liquida', async () => {
    const { report } = await run(purchase({ amountPaid: '20.00' }), fullOrder());
    expect(report.refundAction).toBe('full');
    expect(report.divergences).toContain('amount');
    expect(report.hypothetical).toMatchObject({ settlement: 'none', wouldDebitCredits: false });
  });

  it('moeda divergente não liquida', async () => {
    const { report } = await run(purchase(), fullOrder({ currency: 'USD' }));
    expect(report.divergences).toContain('currency');
    expect(report.hypothetical.wouldDebitCredits).toBe(false);
  });

  it('HTTP 429 não liquida e não repete a consulta', async () => {
    const setup = harness(purchase());
    setup.setOrder(async () => ({ status: 429, data: {}, retryAfter: '30' }));
    const report = await observeCardReconciliation({
      purchaseId: PURCHASE,
      env: baseEnv(),
      db: setup.db,
      http: setup.http,
    });
    expect(report.transport).toBe('rate_limit');
    expect(report.hypothetical.label).toBe('Não liquidar');
    expect(report.hypothetical.wouldDebitCredits).toBe(false);
    expect(setup.calls.order).toBe(1);
  });

  it('HTTP 500 não liquida', async () => {
    const setup = harness(purchase());
    setup.setOrder(async () => ({ status: 500, data: {} }));
    const report = await observeCardReconciliation({
      purchaseId: PURCHASE,
      env: baseEnv(),
      db: setup.db,
      http: setup.http,
    });
    expect(report.transport).toBe('unavailable');
    expect(report.ok).toBe(false);
    expect(report.hypothetical.wouldChangeStatus).toBe(false);
    expect(setup.calls.order).toBe(1);
  });

  it('timeout não liquida', async () => {
    const setup = harness(purchase());
    setup.setOrder(async () => {
      throw new MercadoPagoTimeoutError();
    });
    const report = await observeCardReconciliation({
      purchaseId: PURCHASE,
      env: baseEnv(),
      db: setup.db,
      http: setup.http,
    });
    expect(report.transport).toBe('timeout');
    expect(report.hypothetical.wouldDebitCredits).toBe(false);
    expect(setup.calls.order).toBe(1);
  });

  it('compra ausente interrompe antes da consulta externa', async () => {
    const setup = harness(null);
    await expect(
      observeCardReconciliation({
        purchaseId: PURCHASE,
        env: baseEnv(),
        db: setup.db,
        http: setup.http,
      }),
    ).rejects.toMatchObject({ reason: 'compra_ausente' });
    expect(setup.calls.me).toBe(0);
    expect(setup.calls.order).toBe(0);
  });

  it('outro provedor interrompe antes da consulta externa', async () => {
    const setup = harness(purchase({ provider: 'pix', providerTxId: 'pix:ORDPIX' }));
    await expect(
      observeCardReconciliation({
        purchaseId: PURCHASE,
        env: baseEnv(),
        db: setup.db,
        http: setup.http,
      }),
    ).rejects.toMatchObject({ reason: 'provedor_invalido' });
    expect(setup.calls.me).toBe(0);
    expect(setup.calls.order).toBe(0);
  });

  it('ambiente fora do Sandbox interrompe antes do banco e da consulta', async () => {
    const setup = harness(purchase());
    await expect(
      observeCardReconciliation({
        purchaseId: PURCHASE,
        env: baseEnv({ sandbox: false }),
        db: setup.db,
        http: setup.http,
      }),
    ).rejects.toMatchObject({ reason: 'sandbox_inativo' });
    expect(setup.calls.server).toBe(0);
    expect(setup.calls.order).toBe(0);
  });

  it('banco diferente do autorizado interrompe antes da consulta', async () => {
    const setup = harness(purchase());
    await expect(
      observeCardReconciliation({
        purchaseId: PURCHASE,
        env: baseEnv({
          databaseUrl: 'postgresql://observer:secret@localhost:5432/after_refund_tx',
        }),
        db: setup.db,
        http: setup.http,
      }),
    ).rejects.toMatchObject({ reason: 'banco_recusado' });
    expect(setup.calls.server).toBe(0);
    expect(setup.calls.order).toBe(0);

    const connected = harness(purchase(), { name: 'after_refund_tx', addr: '::1/128', port: 5432 });
    await expect(
      observeCardReconciliation({
        purchaseId: PURCHASE,
        env: baseEnv(),
        db: connected.db,
        http: connected.http,
      }),
    ).rejects.toMatchObject({ reason: 'banco_recusado' });
    expect(connected.calls.order).toBe(0);
  });

  it('reconciliação automática ligada interrompe antes da consulta', async () => {
    const setup = harness(purchase());
    await expect(
      observeCardReconciliation({
        purchaseId: PURCHASE,
        env: baseEnv({ reconcileEnabled: true }),
        db: setup.db,
        http: setup.http,
      }),
    ).rejects.toMatchObject({ reason: 'reconcilacao_ligada' });
    expect(setup.calls.server).toBe(0);
    expect(setup.calls.me).toBe(0);
    expect(setup.calls.order).toBe(0);
  });

  it('conta diferente não consulta a ordem', async () => {
    const setup = harness(purchase());
    setup.http.getCurrentUser = async () => {
      setup.calls.me += 1;
      return { status: 200, data: { id: 1, tags: ['test_user'] } };
    };
    await expect(
      observeCardReconciliation({
        purchaseId: PURCHASE,
        env: baseEnv(),
        db: setup.db,
        http: setup.http,
      }),
    ).rejects.toMatchObject({ reason: 'conta_nao_teste' });
    expect(setup.calls.order).toBe(0);
  });

  it.each([
    [401, 'account_http_401'],
    [403, 'account_http_403'],
    [429, 'account_http_429'],
    [500, 'account_http_5xx'],
    [503, 'account_http_5xx'],
  ] as const)('HTTP %s da conta bloqueia a ordem', async (status, reason) => {
    const setup = harness(purchase());
    setup.http.getCurrentUser = async () => {
      setup.calls.me += 1;
      return { status, data: { message: TOKEN, authorization: `Bearer ${TOKEN}` } };
    };
    const error = await observeCardReconciliation({
      purchaseId: PURCHASE,
      env: baseEnv(),
      db: setup.db,
      http: setup.http,
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      reason,
      detail: { endpoint: 'GET /users/me', httpStatus: status },
    });
    expect(JSON.stringify(error)).not.toContain(TOKEN);
    expect(setup.calls.order).toBe(0);
  });

  it.each([
    ['timeout', () => new MercadoPagoTimeoutError(), 'account_timeout'],
    [
      'dns',
      () => Object.assign(new Error(`getaddrinfo ENOTFOUND ${TOKEN}`), { code: 'ENOTFOUND' }),
      'account_dns_error',
    ],
    [
      'conexao',
      () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      'account_connection_error',
    ],
    [
      'tls',
      () =>
        Object.assign(new Error('certificate'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }),
      'account_tls_error',
    ],
    ['desconhecido', () => new Error(`socket hang up ${TOKEN}`), 'account_unknown_error'],
  ] as const)('falha %s da conta bloqueia a ordem', async (_label, build, reason) => {
    const setup = harness(purchase());
    setup.http.getCurrentUser = async () => {
      setup.calls.me += 1;
      throw build();
    };
    const error = await observeCardReconciliation({
      purchaseId: PURCHASE,
      env: baseEnv(),
      db: setup.db,
      http: setup.http,
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      reason,
      detail: { endpoint: 'GET /users/me' },
    });
    expect(JSON.stringify(error)).not.toContain(TOKEN);
    expect(setup.calls.order).toBe(0);
  });

  it('resposta inválida da conta bloqueia a ordem', async () => {
    const setup = harness(purchase());
    setup.http.getCurrentUser = async () => {
      setup.calls.me += 1;
      return { status: 200, data: { message: TOKEN } };
    };
    await expect(
      observeCardReconciliation({
        purchaseId: PURCHASE,
        env: baseEnv(),
        db: setup.db,
        http: setup.http,
      }),
    ).rejects.toMatchObject({ reason: 'account_invalid_response' });
    expect(setup.calls.order).toBe(0);
  });

  it('conta sem a tag de teste bloqueia a ordem', async () => {
    const setup = harness(purchase());
    setup.http.getCurrentUser = async () => {
      setup.calls.me += 1;
      return {
        status: 200,
        data: { id: Number(CARD_OBSERVE_EXPECTED_SELLER_ID), tags: ['normal'] },
      };
    };
    await expect(
      observeCardReconciliation({
        purchaseId: PURCHASE,
        env: baseEnv(),
        db: setup.db,
        http: setup.http,
      }),
    ).rejects.toMatchObject({ reason: 'conta_nao_teste' });
    expect(setup.calls.order).toBe(0);
  });

  it('o cliente real só emite GET da conta e da ordem', async () => {
    const client = new MercadoPagoOrdersClient();
    const seen: string[] = [];
    client.fetchImpl = async (url, init) => {
      seen.push(`${init?.method ?? ''} ${String(url)} ${init?.body ?? ''}`);
      const path = String(url);
      const data = path.endsWith('/users/me')
        ? { id: Number(CARD_OBSERVE_EXPECTED_SELLER_ID), tags: ['test_user'] }
        : paidOrder();
      return {
        status: 200,
        json: async () => data,
        headers: { get: () => null },
      } as Response;
    };
    const setup = harness(purchase());
    const report = await observeCardReconciliation({
      purchaseId: PURCHASE,
      env: baseEnv(),
      db: setup.db,
      http: {
        getCurrentUser: (token, timeoutMs) => client.getCurrentUser(token, { timeoutMs }),
        getOrder: (token, orderId, timeoutMs) => client.getOrder(token, orderId, { timeoutMs }),
      },
    });
    expect(seen).toHaveLength(2);
    expect(seen.every((line) => line.startsWith('GET '))).toBe(true);
    expect(seen[0]).toContain('/users/me');
    expect(seen[1]).toContain(`/v1/orders/${ORDER}`);
    expect(seen.join('\n')).not.toContain('POST');
    expect(JSON.stringify(report)).not.toContain(TOKEN);
    expect(report.hypothetical.label).toBe('Manter PAID');
  });

  it('o fluxo não importa liquidação nem o agendador', () => {
    const moduleSource = readFileSync(join(__dirname, 'card-reconcile-observe.ts'), 'utf8');
    const scriptSource = readFileSync(
      join(__dirname, '../../scripts/observe-card-reconciliation.ts'),
      'utf8',
    );
    const forbidden = [
      'reconcilePaidCardPurchases',
      'applyVerifiedCardOrder',
      'settleCardTerminalStatus',
      'CreditsService',
      'CardRefundReconcileScheduler',
      '$executeRaw',
      'createCharge',
      'createOrder',
    ];
    for (const name of forbidden) {
      expect(moduleSource).not.toContain(name);
      expect(scriptSource).not.toContain(name);
    }
  });
});
