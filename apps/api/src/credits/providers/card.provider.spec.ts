import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { MercadoPagoOrdersClient, MercadoPagoTimeoutError, MercadoPagoNetworkError } from './mercado-pago-orders';
import {
  CARD_MAX_INSTALLMENTS,
  CARD_SANDBOX_PAYER_EMAIL,
  CARD_STATEMENT_DESCRIPTOR,
  CardPaymentProvider,
  CardReconcileRateLimitError,
  CardReconcileTransportError,
  assertOpaqueCardToken,
  assessCardRefund,
  cardOperationPurchaseId,
  cardOrderMatchesPurchase,
  cardRefundAction,
  decidePaidCardReconcileAction,
} from './card.provider';
import {
  SANDBOX_PARTIAL_ORDER_ID,
  SANDBOX_PARTIAL_PAYMENT_ID,
  SANDBOX_PARTIAL_PURCHASE_ID,
  SANDBOX_PARTIAL_REFUND_ID,
  sandboxPartialCardOrder,
} from './card-refund.sandbox-fixture';
import {
  CARD_RECONCILE_COOLDOWN_CAP_MS,
  cardReconcileCooldownMs,
} from '../card-refund.ledger';

const TOKEN = '519ada5ac7431ef6ce24ac19c38f6768';

function chargeInput() {
  return {
    purchaseId: 'cpabc',
    packageKey: 'unit_1',
    amountBrl: 34.9,
    token: TOKEN,
    paymentMethodId: 'visa',
    paymentType: 'credit_card' as const,
    installments: 1,
    payerEmail: 'venue@test.com',
    payerName: 'Maria Silva',
    idempotencyKey: 'card-order:cpabc',
  };
}

function cardOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ORD01CARD',
    status: 'processed',
    status_detail: 'accredited',
    total_amount: '34.90',
    external_reference: 'cpabc',
    currency_id: 'BRL',
    transactions: {
      payments: [
        {
          id: 'PAY01CARD',
          status: 'processed',
          status_detail: 'accredited',
          amount: '34.90',
          payment_method: {
            id: 'visa',
            type: 'credit_card',
            token: TOKEN,
            installments: 1,
          },
        },
      ],
    },
    ...overrides,
  };
}

describe('CardPaymentProvider', () => {
  const originalToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const originalPublic = process.env.MERCADO_PAGO_PUBLIC_KEY;
  const originalSandbox = process.env.MERCADO_PAGO_SANDBOX;
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalToken === undefined) delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    else process.env.MERCADO_PAGO_ACCESS_TOKEN = originalToken;
    if (originalPublic === undefined) delete process.env.MERCADO_PAGO_PUBLIC_KEY;
    else process.env.MERCADO_PAGO_PUBLIC_KEY = originalPublic;
    if (originalSandbox === undefined) delete process.env.MERCADO_PAGO_SANDBOX;
    else process.env.MERCADO_PAGO_SANDBOX = originalSandbox;
  });

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.MERCADO_PAGO_SANDBOX;
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-test-token-secret';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-public-key';
  });

  function providerWith(createOrder = jest.fn(), getOrder = jest.fn()) {
    const client = { createOrder, getOrder } as unknown as MercadoPagoOrdersClient;
    return { provider: new CardPaymentProvider(client), createOrder, getOrder };
  }

  it('a identidade da compra é estável por estabelecimento e operação', () => {
    const id = cardOperationPurchaseId('venue-1', 'card-op-1234567890ab');
    expect(id).toBe(cardOperationPurchaseId('venue-1', 'card-op-1234567890ab'));
    expect(id).not.toBe(cardOperationPurchaseId('venue-2', 'card-op-1234567890ab'));
    expect(id).toMatch(/^cp[a-f0-9]{32}$/);
    expect(CARD_MAX_INSTALLMENTS).toBe(1);
  });

  it('rejeita PAN e mantém o token opaco', () => {
    expect(() => assertOpaqueCardToken('4242424242424242')).toThrow(
      'token opaco',
    );
    expect(() => assertOpaqueCardToken(TOKEN)).not.toThrow();
  });

  it('createCharge envia 1x no cartão de crédito com chave estável e o preço do catálogo', async () => {
    const { provider, createOrder } = providerWith(
      jest.fn().mockResolvedValue({ status: 201, data: cardOrder() }),
    );

    const result = await provider.createCharge({
      purchaseId: 'cpabc',
      packageKey: 'unit_1',
      amountBrl: 34.9,
      token: TOKEN,
      paymentMethodId: 'visa',
      paymentType: 'credit_card',
      installments: 1,
      payerEmail: 'venue@test.com',
      payerName: 'Venue Owner',
      idempotencyKey: 'card-order:cpabc',
    });

    expect(result.kind).toBe('order');
    if (result.kind !== 'order') return;
    expect(result.order.status).toBe('PAID');
    expect(result.order.installments).toBe(1);
    expect(result.order.paymentType).toBe('credit_card');
    expect(result.order.currency).toBe('BRL');
    const [accessToken, idempotencyKey, body] = createOrder.mock.calls[0] as [
      string,
      string,
      {
        total_amount: string;
        external_reference: string;
        transactions: {
          payments: Array<{
            payment_method: {
              type: string;
              token: string;
              installments: number;
            };
          }>;
        };
      },
    ];
    expect(accessToken).toBe('APP_USR-test-token-secret');
    expect(idempotencyKey).toBe('card-order:cpabc');
    expect(body.total_amount).toBe('34.90');
    expect(body.external_reference).toBe('cpabc');
    expect(body.transactions.payments[0].payment_method).toEqual({
      id: 'visa',
      type: 'credit_card',
      token: TOKEN,
      installments: 1,
      statement_descriptor: CARD_STATEMENT_DESCRIPTOR,
    });
  });

  it('createCharge envia CREDITOAFTER na fatura do cartão, sem o prefixo MP', async () => {
    const { provider, createOrder } = providerWith(
      jest.fn().mockResolvedValue({ status: 201, data: cardOrder() }),
    );

    await provider.createCharge(chargeInput());

    const body = createOrder.mock.calls[0][2] as {
      description: string;
      total_amount: string;
      config?: unknown;
      transactions: {
        payments: Array<{
          amount: string;
          payment_method: {
            type: string;
            installments: number;
            statement_descriptor: string;
          };
        }>;
      };
    };
    expect(CARD_STATEMENT_DESCRIPTOR).toBe('CREDITOAFTER');
    expect(body.transactions.payments[0].payment_method.statement_descriptor).toBe(
      'CREDITOAFTER',
    );
    expect(body.transactions.payments[0].payment_method.statement_descriptor).not.toMatch(
      /MP/i,
    );
    expect(body.config).toBeUndefined();
    expect(body.description).toBe('AFTER créditos unit_1');
    expect(body.total_amount).toBe('34.90');
    expect(body.transactions.payments[0].amount).toBe('34.90');
    expect(body.transactions.payments[0].payment_method.installments).toBe(1);
    expect(body.transactions.payments[0].payment_method.type).toBe('credit_card');
  });

  it('não registra o token do cartão nem o Access Token no log', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { provider } = providerWith(
      jest.fn().mockResolvedValue({
        status: 402,
        data: {
          message: `declined ${TOKEN} APP_USR-test-token-secret`,
          status: 'failed',
        },
      }),
    );

    const result = await provider.createCharge({
      purchaseId: 'cpabc',
      packageKey: 'unit_1',
      amountBrl: 34.9,
      token: TOKEN,
      paymentMethodId: 'visa',
      paymentType: 'credit_card',
      installments: 1,
      payerEmail: 'venue@test.com',
      idempotencyKey: 'card-order:cpabc',
    });

    expect(result.kind).toBe('rejected');
    const text = logged.mock.calls.flat().join(' ');
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('APP_USR-test-token-secret');
    logged.mockRestore();
  });

  it('HTTP 402 com order recusada pede consulta e não trata o corpo como ausência', async () => {
    const { provider, createOrder } = providerWith(
      jest.fn().mockResolvedValue({
        status: 402,
        data: {
          errors: [
            {
              code: 'failed',
              message: 'The following transactions failed',
              details: ['pay_01JE797F7RX989RWQJHP4VHF94: cc_rejected_other_reason'],
            },
          ],
          data: {
            id: 'ORD402CARD',
            status: 'failed',
            status_detail: 'failed',
            total_amount: '34.90',
            external_reference: 'cpabc',
            currency_id: 'BRL',
            transactions: {
              payments: [
                {
                  id: 'pay_01JE797F7RX989RWQJHP4VHF94',
                  status: 'failed',
                  status_detail: 'cc_rejected_other_reason',
                  payment_method: { id: 'visa', type: 'credit_card', installments: 1 },
                },
              ],
            },
          },
        },
      }),
    );
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const result = await provider.createCharge(chargeInput());
    expect(result).toEqual({
      kind: 'order',
      confirmWithGet: true,
      order: expect.objectContaining({
        orderId: 'ORD402CARD',
        status: 'FAILED',
      }),
    });
    expect(createOrder).toHaveBeenCalledTimes(1);
    const text = logged.mock.calls.flat().join(' ');
    expect(text).toContain('purchase cpabc');
    expect(text).toContain('order ORD402CARD');
    expect(text).toContain('cc_rejected_other_reason');
    expect(text).not.toContain(TOKEN);
    logged.mockRestore();
  });

  it('HTTP 402 sem order e com recusa explícita não credita a tentativa', async () => {
    const { provider } = providerWith(
      jest.fn().mockResolvedValue({
        status: 402,
        data: {
          errors: [
            {
              code: 'failed',
              message: 'The following transactions failed',
              details: ['cc_rejected_bad_filled_security_code'],
            },
          ],
        },
      }),
    );
    await expect(provider.createCharge(chargeInput())).resolves.toEqual({ kind: 'rejected' });
  });

  it('HTTP 402 ambíguo permanece desconhecido', async () => {
    const { provider } = providerWith(
      jest.fn().mockResolvedValue({
        status: 402,
        data: {
          errors: [
            { code: 'failed', message: 'The following transactions failed' },
          ],
        },
      }),
    );
    await expect(provider.createCharge(chargeInput())).resolves.toEqual({ kind: 'unknown' });
  });

  it('HTTP 500 não vira recusa', async () => {
    const { provider } = providerWith(
      jest.fn().mockResolvedValue({ status: 500, data: { message: 'unavailable' } }),
    );
    await expect(provider.createCharge(chargeInput())).resolves.toEqual({ kind: 'unknown' });
  });

  it('timeout e HTTP 500 ficam desconhecidos, sem marcar recusa', async () => {
    const timeout = providerWith(jest.fn().mockRejectedValue(new Error(`timed out ${TOKEN}`)));
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(
      timeout.provider.createCharge({
        purchaseId: 'cpabc',
        packageKey: 'unit_1',
        amountBrl: 34.9,
        token: TOKEN,
        paymentMethodId: 'visa',
        paymentType: 'credit_card',
        installments: 1,
        payerEmail: 'venue@test.com',
        idempotencyKey: 'card-order:cpabc',
      }),
    ).resolves.toEqual({ kind: 'unknown' });
    expect(logged.mock.calls.flat().join(' ')).not.toContain(TOKEN);

    const unavailable = providerWith(
      jest.fn().mockResolvedValue({ status: 503, data: { message: TOKEN } }),
    );
    await expect(
      unavailable.provider.createCharge({
        purchaseId: 'cpabc',
        packageKey: 'unit_1',
        amountBrl: 34.9,
        token: TOKEN,
        paymentMethodId: 'visa',
        paymentType: 'credit_card',
        installments: 1,
        payerEmail: 'venue@test.com',
        idempotencyKey: 'card-order:cpabc',
      }),
    ).resolves.toEqual({ kind: 'unknown' });
    logged.mockRestore();
  });

  it('public key não devolve o Access Token', () => {
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'TEST-public-key';
    const { provider } = providerWith();
    expect(provider.publicKey).toBe('TEST-public-key');
    expect(provider.publicKey).not.toContain('APP_USR');
    expect(provider.isConfigured).toBe(true);
  });

  it('sandbox troca o pagador e produção com sandbox não chama a API', async () => {
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-access-token';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'TEST-public-key';
    const { provider, createOrder } = providerWith(
      jest.fn().mockResolvedValue({ status: 201, data: cardOrder() }),
    );
    await provider.createCharge({
      purchaseId: 'cpabc',
      packageKey: 'unit_1',
      amountBrl: 34.9,
      token: TOKEN,
      paymentMethodId: 'visa',
      paymentType: 'credit_card',
      installments: 1,
      payerEmail: 'venue@test.com',
      payerName: 'Maria Silva',
      idempotencyKey: 'card-order:cpabc',
    });
    const body = createOrder.mock.calls[0][2] as {
      payer: { email: string; first_name?: string; last_name?: string };
      transactions: { payments: Array<{ payment_method: { token: string } }> };
    };
    expect(body.payer.email).toBe(CARD_SANDBOX_PAYER_EMAIL);
    expect(body.payer.email).not.toBe('venue@test.com');
    expect(body.payer.email).not.toBe('test_user_br@testuser.com');
    expect(body.payer.first_name).toBe('Maria');
    expect(body.payer.last_name).toBe('Silva');
    expect(body.payer.first_name).not.toBe('APRO');
    expect(body.transactions.payments[0].payment_method.token).toBe(TOKEN);

    process.env.NODE_ENV = 'production';
    await expect(
      provider.createCharge({
        purchaseId: 'cpabc',
        packageKey: 'unit_1',
        amountBrl: 34.9,
        token: TOKEN,
        paymentMethodId: 'visa',
        paymentType: 'credit_card',
        installments: 1,
        payerEmail: 'venue@test.com',
        idempotencyKey: 'card-order:cpabc',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('sandbox aceita o par APP_USR das credenciais de teste', async () => {
    process.env.NODE_ENV = 'test';
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-test-token-secret';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-public-key';
    const { provider, createOrder } = providerWith(
      jest.fn().mockResolvedValue({ status: 201, data: cardOrder() }),
    );
    const result = await provider.createCharge({
      purchaseId: 'cpabc',
      packageKey: 'unit_1',
      amountBrl: 34.9,
      token: TOKEN,
      paymentMethodId: 'visa',
      paymentType: 'credit_card',
      installments: 1,
      payerEmail: 'venue@test.com',
      idempotencyKey: 'card-order:cpabc',
    });
    expect(result.kind).toBe('order');
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('Public Key APP_USR com Access Token TEST- cria a cobrança de teste', async () => {
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-access-token';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-public-key';
    const { provider, createOrder } = providerWith(
      jest.fn().mockResolvedValue({ status: 201, data: cardOrder() }),
    );
    const result = await provider.createCharge({
      purchaseId: 'cpabc',
      packageKey: 'unit_1',
      amountBrl: 34.9,
      token: TOKEN,
      paymentMethodId: 'visa',
      paymentType: 'credit_card',
      installments: 1,
      payerEmail: 'venue@test.com',
      idempotencyKey: 'card-order:cpabc',
    });
    expect(result.kind).toBe('order');
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('produção recusa Public Key TEST-', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-test-token-secret';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'TEST-public-key';
    const { provider, createOrder } = providerWith();
    await expect(
      provider.createCharge({
        purchaseId: 'cpabc',
        packageKey: 'unit_1',
        amountBrl: 34.9,
        token: TOKEN,
        paymentMethodId: 'visa',
        paymentType: 'credit_card',
        installments: 1,
        payerEmail: 'venue@test.com',
        idempotencyKey: 'card-order:cpabc',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('consulta de order existente segue com credencial incompatível', async () => {
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-test-token-secret';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'TEST-public-key';
    const getOrder = jest.fn().mockResolvedValue({
      status: 200,
      data: cardOrder(),
    });
    const { provider } = providerWith(jest.fn(), getOrder);
    const order = await provider.getOrder('ORD01CARD');
    expect(order.status).toBe('PAID');
    expect(getOrder).toHaveBeenCalledTimes(1);
  });

  it('action_required permanece pendente e estorno parcial não vira estorno total', async () => {
    const challenge = providerWith(
      jest.fn(),
      jest.fn().mockResolvedValue({
        status: 200,
        data: cardOrder({
          status: 'action_required',
          status_detail: 'pending_challenge',
        }),
      }),
    );
    const pending = await challenge.provider.getOrder('ORD01CARD');
    expect(pending.status).toBe('PENDING');
    expect(pending.refundScope).toBe('none');

    const partial = providerWith(
      jest.fn(),
      jest.fn().mockResolvedValue({
        status: 200,
        data: cardOrder({
          status: 'processed',
          status_detail: 'partially_refunded',
        }),
      }),
    );
    const refunded = await partial.provider.getOrder('ORD01CARD');
    expect(refunded.status).toBe('REFUNDED');
    expect(refunded.refundScope).toBe('review');
    expect(refunded.refundedAmountBrl).toBeNull();
    expect(refunded.refundId).toBeNull();

    const detailed = providerWith(
      jest.fn(),
      jest.fn().mockResolvedValue({
        status: 200,
        data: cardOrder({
          status: 'processed',
          status_detail: 'partially_refunded',
          transactions: {
            payments: [
              {
                id: 'PAY01CARD',
                status: 'processed',
                status_detail: 'partially_refunded',
                amount: '34.90',
                payment_method: { id: 'visa', type: 'credit_card', installments: 1 },
              },
            ],
            refunds: [
              {
                id: 'REF01CARD',
                transaction_id: 'PAY01CARD',
                reference_id: 'ref-card',
                amount: '10.00',
                status: 'processed',
              },
            ],
          },
        }),
      }),
    );
    const known = await detailed.provider.getOrder('ORD01CARD');
    expect(known.refundScope).toBe('partial');
    expect(known.refundedAmountBrl).toBe(10);
    expect(known.refundId).toBe('REF01CARD');

    const chargeback = providerWith(
      jest.fn(),
      jest.fn().mockResolvedValue({
        status: 200,
        data: cardOrder({
          status: 'charged_back',
          status_detail: 'settled',
        }),
      }),
    );
    const lost = await chargeback.provider.getOrder('ORD01CARD');
    expect(lost.status).toBe('REFUNDED');
    expect(lost.refundScope).toBe('review');
    expect(lost.refundedAmountBrl).toBeNull();
  });

  it('lê currency e currency_id e só aceita BRL concordante', async () => {
    const read = async (data: Record<string, unknown>) => {
      const { provider } = providerWith(
        jest.fn(),
        jest.fn().mockResolvedValue({ status: 200, data }),
      );
      return provider.getOrder('ORD01CARD');
    };
    const live = await read(cardOrder({ currency: 'BRL', currency_id: '' }));
    const legacy = await read(cardOrder({ currency_id: 'BRL' }));
    const both = await read(cardOrder({ currency: 'brl', currency_id: 'BRL' }));
    const divergent = await read(cardOrder({ currency: 'USD', currency_id: 'BRL' }));
    const absent = await read(cardOrder({ currency_id: '', currency: '' }));

    expect(live.currency).toBe('BRL');
    expect(legacy.currency).toBe('BRL');
    expect(both.currency).toBe('BRL');
    expect(divergent.currency).toBe('');
    expect(absent.currency).toBe('');
    expect(live.refundScope).toBe('none');
    expect(
      cardOrderMatchesPurchase({ id: 'cpabc', amountPaid: 34.9 }, live),
    ).toBe(true);
    expect(
      cardOrderMatchesPurchase({ id: 'cpabc', amountPaid: 34.9 }, divergent),
    ).toBe(false);
    expect(
      cardOrderMatchesPurchase({ id: 'cpabc', amountPaid: 34.9 }, absent),
    ).toBe(false);
  });

  it('classifica reembolsos processados e recusa os que não comprovam o valor', async () => {
    const payment = {
      id: 'PAY01CARD',
      status: 'processed',
      status_detail: 'refunded',
      amount: '34.90',
      paid_amount: '34.90',
      reference_id: 'ref-card',
      payment_method: { id: 'master', type: 'credit_card', installments: 1 },
    };
    const refund = {
      id: 'REF01CARD',
      transaction_id: 'PAY01CARD',
      reference_id: 'ref-card',
      amount: '34.90',
      status: 'processed',
    };
    const read = async (data: Record<string, unknown>) => {
      const { provider } = providerWith(
        jest.fn(),
        jest.fn().mockResolvedValue({ status: 200, data }),
      );
      return provider.getOrder('ORD01CARD');
    };
    const base = {
      status: 'processed',
      status_detail: 'refunded',
      currency: 'BRL',
    };

    const full = await read(
      cardOrder({ ...base, transactions: { payments: [payment], refunds: [refund] } }),
    );
    expect(full.refundScope).toBe('full');
    expect(full.refundedAmountBrl).toBe(34.9);
    expect(full.refundId).toBe('REF01CARD');

    const partial = await read(
      cardOrder({
        ...base,
        status_detail: 'partially_refunded',
        transactions: {
          payments: [{ ...payment, status_detail: 'partially_refunded' }],
          refunds: [{ ...refund, amount: '10.00' }],
        },
      }),
    );
    expect(partial.refundScope).toBe('partial');
    expect(partial.refundedAmountBrl).toBe(10);

    const pending = await read(
      cardOrder({
        ...base,
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, status: 'pending' }],
        },
      }),
    );
    const failed = await read(
      cardOrder({
        ...base,
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, status: 'failed' }],
        },
      }),
    );
    expect(pending.refundScope).toBe('review');
    expect(failed.refundScope).toBe('review');
    expect(pending.refundedAmountBrl).toBeNull();

    const duplicate = await read(
      cardOrder({
        ...base,
        transactions: { payments: [payment], refunds: [refund, { ...refund }] },
      }),
    );
    expect(duplicate.refundScope).toBe('full');
    expect(duplicate.refundedAmountBrl).toBe(34.9);

    const conflictingDuplicate = await read(
      cardOrder({
        ...base,
        transactions: {
          payments: [payment],
          refunds: [refund, { ...refund, amount: '10.00' }],
        },
      }),
    );
    expect(conflictingDuplicate.refundScope).toBe('review');

    const short = await read(
      cardOrder({
        ...base,
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, amount: '10.00' }],
        },
      }),
    );
    expect(short.refundScope).toBe('partial');
    expect(short.refundedAmountBrl).toBe(10);
    expect(short.refundId).toBe('REF01CARD');

    const accumulated = await read(
      cardOrder({
        ...base,
        transactions: {
          payments: [payment],
          refunds: [
            { ...refund, id: 'REF-A', amount: '10.00' },
            { ...refund, id: 'REF-B', amount: '10.00' },
          ],
        },
      }),
    );
    expect(accumulated.refundScope).toBe('partial');
    expect(accumulated.refundedAmountBrl).toBe(20);
    expect(accumulated.refundId).toBeNull();

    const repeated = await read(
      cardOrder({
        ...base,
        transactions: {
          payments: [payment],
          refunds: [
            { ...refund, amount: '10.00' },
            { ...refund, amount: '10.00' },
          ],
        },
      }),
    );
    expect(repeated.refundScope).toBe('partial');
    expect(repeated.refundedAmountBrl).toBe(10);

    const over = await read(
      cardOrder({
        ...base,
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, amount: '40.00' }],
        },
      }),
    );
    expect(over.refundScope).toBe('review');
    expect(over.refundedAmountBrl).toBeNull();
    expect(over.refundId).toBeNull();

    const partialLabelCoveringAll = await read(
      cardOrder({
        ...base,
        status_detail: 'partially_refunded',
        transactions: {
          payments: [{ ...payment, status_detail: 'partially_refunded' }],
          refunds: [refund],
        },
      }),
    );
    expect(partialLabelCoveringAll.refundScope).toBe('review');
    expect(partialLabelCoveringAll.refundedAmountBrl).toBeNull();

    const hidden = await read(
      cardOrder({
        transactions: {
          payments: [{ ...payment, status_detail: 'accredited' }],
          refunds: [{ ...refund, amount: '10.00' }],
        },
      }),
    );
    expect(hidden.refundScope).toBe('review');
    expect(hidden.refundedAmountBrl).toBeNull();

    const chargebackPartial = await read(
      cardOrder({
        status: 'charged_back',
        status_detail: 'settled',
        transactions: {
          payments: [{ ...payment, status: 'charged_back', status_detail: 'settled' }],
          refunds: [{ ...refund, amount: '10.00' }],
        },
      }),
    );
    expect(chargebackPartial.refundScope).toBe('review');
    expect(chargebackPartial.refundedAmountBrl).toBeNull();

    const bare = await read(cardOrder({ status: 'refunded', status_detail: 'refunded' }));
    expect(bare.refundScope).toBe('review');

    const otherPayment = await read(
      cardOrder({
        ...base,
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, transaction_id: 'PAYOTHER' }],
        },
      }),
    );
    expect(otherPayment.refundScope).toBe('review');
  });

  it('aceita o parcial do Sandbox mesmo com reference_id diferente', async () => {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-test-token-secret';
    const { provider } = providerWith(
      jest.fn(),
      jest.fn().mockResolvedValue({ status: 200, data: sandboxPartialCardOrder() }),
    );

    const order = await provider.getOrder(SANDBOX_PARTIAL_ORDER_ID);

    expect(order.status).toBe('REFUNDED');
    expect(order.orderId).toBe(SANDBOX_PARTIAL_ORDER_ID);
    expect(order.paymentId).toBe(SANDBOX_PARTIAL_PAYMENT_ID);
    expect(order.externalReference).toBe(SANDBOX_PARTIAL_PURCHASE_ID);
    expect(order.currency).toBe('BRL');
    expect(order.amountBrl).toBe(34.9);
    expect(order.refundScope).toBe('partial');
    expect(order.refundedAmountBrl).toBe(10);
    expect(order.refundId).toBe(SANDBOX_PARTIAL_REFUND_ID);
    expect(cardRefundAction(order)).toBe('partial');
    expect(
      cardOrderMatchesPurchase(
        { id: SANDBOX_PARTIAL_PURCHASE_ID, amountPaid: 34.9 },
        order,
      ),
    ).toBe(true);
  });

  it('não usa reference_id para associar o reembolso e recusa prova incompleta', async () => {
    const base = sandboxPartialCardOrder();
    const payment = Array.isArray(base.transactions?.payments)
      ? base.transactions.payments[0]
      : base.transactions?.payments;
    const refund = Array.isArray(base.transactions?.refunds)
      ? base.transactions.refunds[0]
      : base.transactions?.refunds;
    const read = (data: ReturnType<typeof sandboxPartialCardOrder>) =>
      assessCardRefund(data);

    const sameReference = read(
      sandboxPartialCardOrder({
        transactions: {
          payments: [{ ...payment, reference_id: 'mesmo' }],
          refunds: [{ ...refund, reference_id: 'mesmo' }],
        },
      }),
    );
    const otherReference = read(sandboxPartialCardOrder());
    expect(sameReference).toEqual(otherReference);
    expect(otherReference.refundScope).toBe('partial');

    const otherPayment = read(
      sandboxPartialCardOrder({
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, transaction_id: 'PAYOTHER', reference_id: payment?.reference_id }],
        },
      }),
    );
    const missingTransaction = read(
      sandboxPartialCardOrder({
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, transaction_id: '  ' }],
        },
      }),
    );
    const missingRefundId = read(
      sandboxPartialCardOrder({
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, id: '' }],
        },
      }),
    );
    const pending = read(
      sandboxPartialCardOrder({
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, status: 'pending' }],
        },
      }),
    );
    const failed = read(
      sandboxPartialCardOrder({
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, status: 'failed' }],
        },
      }),
    );
    const invalidAmount = read(
      sandboxPartialCardOrder({
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, amount: '10.001' }],
        },
      }),
    );
    const zero = read(
      sandboxPartialCardOrder({
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, amount: '0.00' }],
        },
      }),
    );
    const conflicting = read(
      sandboxPartialCardOrder({
        transactions: {
          payments: [payment],
          refunds: [refund, { ...refund, amount: '12.00' }],
        },
      }),
    );
    const over = read(
      sandboxPartialCardOrder({
        transactions: {
          payments: [payment],
          refunds: [{ ...refund, amount: '40.00' }],
        },
      }),
    );
    const fullDespiteDifferentReference = read(
      sandboxPartialCardOrder({
        status_detail: 'refunded',
        transactions: {
          payments: [{ ...payment, status_detail: 'refunded' }],
          refunds: [{ ...refund, amount: '34.90', reference_id: 'nao-e-o-pagamento' }],
        },
      }),
    );

    for (const rejected of [
      otherPayment,
      missingTransaction,
      missingRefundId,
      pending,
      failed,
      invalidAmount,
      zero,
      conflicting,
      over,
    ]) {
      expect(rejected.refundScope).toBe('review');
      expect(rejected.refundedAmountBrl).toBeNull();
      expect(cardRefundAction({ status: 'REFUNDED', ...rejected })).toBe('review');
    }
    expect(fullDespiteDifferentReference.refundScope).toBe('full');
    expect(fullDespiteDifferentReference.refundedAmountBrl).toBe(34.9);
    expect(
      cardRefundAction({ status: 'REFUNDED', ...fullDespiteDifferentReference }),
    ).toBe('full');
    expect(
      cardOrderMatchesPurchase(
        { id: SANDBOX_PARTIAL_PURCHASE_ID, amountPaid: 34.9 },
        {
          orderId: SANDBOX_PARTIAL_ORDER_ID,
          paymentId: SANDBOX_PARTIAL_PAYMENT_ID,
          status: 'REFUNDED',
          amountBrl: 34.9,
          currency: 'USD',
          externalReference: SANDBOX_PARTIAL_PURCHASE_ID,
          installments: 1,
          paymentType: 'credit_card',
          paymentMethodId: 'visa',
        },
      ),
    ).toBe(false);
    expect(
      cardOrderMatchesPurchase(
        { id: SANDBOX_PARTIAL_PURCHASE_ID, amountPaid: 34.9 },
        {
          orderId: SANDBOX_PARTIAL_ORDER_ID,
          paymentId: SANDBOX_PARTIAL_PAYMENT_ID,
          status: 'REFUNDED',
          amountBrl: 34.9,
          currency: 'BRL',
          externalReference: 'outra-compra',
          installments: 1,
          paymentType: 'credit_card',
          paymentMethodId: 'visa',
        },
      ),
    ).toBe(false);
  });

  it('aceita o mesmo pedido que o webhook e recusa divergências', () => {
    const purchase = { id: 'cpabc', amountPaid: 34.9 };
    const accepted = {
      orderId: 'ORD01CARD',
      paymentId: 'PAY01CARD',
      status: 'REFUNDED' as const,
      amountBrl: 34.9,
      currency: 'BRL',
      externalReference: 'cpabc',
      installments: 1,
      paymentType: 'credit_card',
      paymentMethodId: 'visa',
    };
    expect(cardOrderMatchesPurchase(purchase, accepted)).toBe(true);
    expect(cardOrderMatchesPurchase(purchase, { ...accepted, amountBrl: 10 })).toBe(false);
    expect(cardOrderMatchesPurchase(purchase, { ...accepted, currency: 'USD' })).toBe(false);
    expect(
      cardOrderMatchesPurchase(purchase, { ...accepted, externalReference: 'outra' }),
    ).toBe(false);
    expect(
      cardOrderMatchesPurchase(purchase, { ...accepted, paymentType: 'debit_card' }),
    ).toBe(false);
    expect(cardOrderMatchesPurchase(purchase, { ...accepted, orderId: '12345' })).toBe(false);
  });

  it('review compatível é registrado e incompatibilidade de identidade não liquida', () => {
    const purchase = { id: 'cpabc', amountPaid: 34.9 };
    const review = {
      orderId: 'ORD01CARD',
      paymentId: 'PAY01CARD',
      status: 'REFUNDED' as const,
      amountBrl: 34.9,
      currency: 'BRL',
      externalReference: 'cpabc',
      installments: 1,
      paymentType: 'credit_card',
      paymentMethodId: 'visa',
      refundScope: 'review' as const,
      refundedAmountBrl: null,
      refundId: null,
    };
    const full = {
      ...review,
      refundScope: 'full' as const,
      refundedAmountBrl: 34.9,
      refundId: 'REF-1',
    };
    expect(decidePaidCardReconcileAction('ORD01CARD', purchase, review)).toBe('review');
    expect(
      decidePaidCardReconcileAction('ORD01CARD', purchase, {
        ...review,
        externalReference: 'outra-compra',
      }),
    ).toBe('none');
    expect(
      decidePaidCardReconcileAction('ORD01CARD', purchase, { ...review, currency: 'USD' }),
    ).toBe('none');
    expect(
      decidePaidCardReconcileAction('ORD01CARD', purchase, { ...review, amountBrl: 10 }),
    ).toBe('none');
    expect(decidePaidCardReconcileAction('ORD-OUTRO', purchase, review)).toBe('none');
    expect(
      decidePaidCardReconcileAction('ORD01CARD', purchase, {
        ...review,
        status: 'PAID',
        refundScope: 'none',
      }),
    ).toBe('none');
    expect(decidePaidCardReconcileAction('ORD01CARD', purchase, full)).toBe('full');
    expect(
      decidePaidCardReconcileAction('ORD01CARD', purchase, {
        ...full,
        externalReference: 'outra-compra',
      }),
    ).toBe('none');
    expect(
      decidePaidCardReconcileAction('ORD01CARD', purchase, { ...full, paymentType: null }),
    ).toBe('full');
  });

  it('GET da reconciliação classifica timeout, 429 e 5xx sem levar o token', async () => {
    const secret = 'APP_USR-test-token-secret';
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const timeout = providerWith(
      jest.fn(),
      jest.fn().mockRejectedValue(new MercadoPagoTimeoutError()),
    );
    await expect(
      timeout.provider.getOrder('ORD01CARD', { timeoutMs: 10_000 }),
    ).rejects.toBeInstanceOf(CardReconcileTransportError);
    expect(timeout.getOrder).toHaveBeenCalledWith(secret, 'ORD01CARD', { timeoutMs: 10_000 });

    const limited = providerWith(
      jest.fn(),
      jest.fn().mockResolvedValue({
        status: 429,
        data: { message: secret },
        retryAfter: '30',
      }),
    );
    await expect(
      limited.provider.getOrder('ORD01CARD', { timeoutMs: 10_000 }),
    ).rejects.toEqual(expect.any(CardReconcileRateLimitError));
    await expect(
      limited.provider.getOrder('ORD01CARD', { timeoutMs: 10_000 }),
    ).rejects.toMatchObject({ retryAfterHeader: '30', message: 'rate_limit' });

    for (const status of [500, 502, 503]) {
      const down = providerWith(
        jest.fn(),
        jest.fn().mockResolvedValue({ status, data: { message: secret }, retryAfter: null }),
      );
      await expect(
        down.provider.getOrder('ORD01CARD', { timeoutMs: 10_000 }),
      ).rejects.toMatchObject({ kind: 'unavailable', message: 'unavailable' });
    }

    const plain = providerWith(
      jest.fn(),
      jest.fn().mockResolvedValue({ status: 500, data: { message: secret } }),
    );
    await expect(plain.provider.getOrder('ORD01CARD')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const text = logged.mock.calls.flat().join(' ');
    expect(text).not.toContain(secret);
    expect(text).not.toContain('Bearer');
    logged.mockRestore();
  });

  it('timeout de 10s aborta só o GET e a criação de cobrança segue sem signal', async () => {
    const client = new MercadoPagoOrdersClient();
    const secret = 'APP_USR-test-token-secret';
    const calls: Array<RequestInit | undefined> = [];
    client.fetchImpl = ((url: string, init?: RequestInit) => {
      calls.push(init);
      if (String(url).includes('/v1/orders/ORDWAIT')) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error(`aborted ${secret}`), { name: 'AbortError' }));
          });
        });
      }
      return Promise.resolve({
        status: init?.method === 'GET' ? 429 : 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'retry-after' ? '12' : null),
        },
        json: async () => ({ message: secret }),
      } as Response);
    }) as typeof fetch;

    await client.createOrder(secret, 'idem-key-1234567890abcd', { type: 'online' });
    expect(calls[0]?.signal).toBeUndefined();
    expect(calls[0]?.method).toBe('POST');

    const limited = await client.getOrder(secret, 'ORD01CARD', { timeoutMs: 10_000 });
    expect(limited.status).toBe(429);
    expect(limited.retryAfter).toBe('12');
    expect(calls[1]?.signal).toBeInstanceOf(AbortSignal);

    const started = Date.now();
    await expect(client.getOrder(secret, 'ORDWAIT', { timeoutMs: 40 })).rejects.toMatchObject({
      name: 'MercadoPagoTimeoutError',
      message: 'timeout',
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    const unbounded = client.fetchImpl;
    client.fetchImpl = (async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeUndefined();
      return {
        status: 200,
        headers: { get: () => null },
        json: async () => ({ id: 'ORDPLAIN' }),
      } as unknown as Response;
    }) as typeof fetch;
    await client.getOrder(secret, 'ORDPLAIN');
    expect(unbounded).toBeDefined();
  });

  it('GET /users/me classifica rede e não devolve o token', async () => {
    const client = new MercadoPagoOrdersClient();
    const secret = 'APP_USR-test-token-secret';
    const cases = [
      ['ECONNREFUSED', 'connection'],
      ['ENOTFOUND', 'dns'],
      ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'tls'],
    ] as const;
    for (const [code, transport] of cases) {
      const seen: Array<{ url: string; init?: RequestInit }> = [];
      client.fetchImpl = (async (url: string, init?: RequestInit) => {
        seen.push({ url: String(url), init });
        throw Object.assign(new Error(`failed ${secret}`), { code });
      }) as typeof fetch;
      const error = await client.getCurrentUser(secret, { timeoutMs: 10_000 }).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(MercadoPagoNetworkError);
      expect(error).toMatchObject({ transport });
      expect(String((error as Error).message)).not.toContain(secret);
      expect(seen[0]?.url).toBe('https://api.mercadopago.com/users/me');
      expect(seen[0]?.init?.method).toBe('GET');
      expect(seen[0]?.init?.body).toBeUndefined();
      expect(seen[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('cooldown ausente ou inválido espera 15 minutos e o válido fica limitado', () => {
    const now = new Date('2026-10-08T18:00:00.000Z');
    expect(cardReconcileCooldownMs(null, now)).toBe(CARD_RECONCILE_COOLDOWN_CAP_MS);
    expect(cardReconcileCooldownMs('   ', now)).toBe(CARD_RECONCILE_COOLDOWN_CAP_MS);
    expect(cardReconcileCooldownMs('nope', now)).toBe(CARD_RECONCILE_COOLDOWN_CAP_MS);
    expect(cardReconcileCooldownMs('0', now)).toBe(CARD_RECONCILE_COOLDOWN_CAP_MS);
    expect(cardReconcileCooldownMs('30', now)).toBe(30_000);
    expect(cardReconcileCooldownMs('7200', now)).toBe(CARD_RECONCILE_COOLDOWN_CAP_MS);
    const soon = new Date(now.getTime() + 45_000).toUTCString();
    expect(cardReconcileCooldownMs(soon, now)).toBe(45_000);
  });
});
