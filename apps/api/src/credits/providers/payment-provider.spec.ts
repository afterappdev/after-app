import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { AppleAppStorePaymentProvider } from './apple-app-store.provider';
import {
  extractMercadoPagoOrderId,
  formatMercadoPagoErrorLog,
  formatMercadoPagoWebhookSignatureLog,
  inspectMercadoPagoWebhookSignature,
  mapMercadoPagoOrderStatus,
  MercadoPagoOrdersClient,
  mercadoPagoErrorLogDetails,
  sanitizeProviderError,
  verifyMercadoPagoWebhookSignature,
} from './mercado-pago-orders';
import {
  buildProviderTxId,
  cardOrderIdFromProviderTxId,
  normalizeProviderId,
  pixOrderIdFromProviderTxId,
} from './payment-provider';
import {
  MERCADO_PAGO_SANDBOX_PAYER,
  PIX_INVALID_PAYER_EMAIL_MESSAGE,
  PixPaymentProvider,
  normalizePixPayerEmail,
} from './pix.provider';

function mpPixOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ORD01TESTPIX',
    status: 'action_required',
    status_detail: 'waiting_transfer',
    total_amount: '34.90',
    external_reference: 'purchase-1',
    transactions: {
      payments: [
        {
          id: 'PAY01TESTPIX',
          status: 'action_required',
          status_detail: 'waiting_transfer',
          amount: '34.90',
          date_of_expiration: '2026-08-26T12:00:00.000Z',
          payment_method: {
            id: 'pix',
            type: 'bank_transfer',
            qr_code: '00020126copia-e-cola',
            qr_code_base64: 'aGVsbG8=',
          },
        },
      ],
    },
    ...overrides,
  };
}

describe('payment provider contract', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.APPLE_SHARED_SECRET;
  const originalAppAppleId = process.env.APPLE_APP_APPLE_ID;
  const originalMpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const originalMpWebhook = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  const originalMpSandbox = process.env.MERCADO_PAGO_SANDBOX;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret === undefined) {
      delete process.env.APPLE_SHARED_SECRET;
    } else {
      process.env.APPLE_SHARED_SECRET = originalSecret;
    }
    if (originalAppAppleId === undefined) {
      delete process.env.APPLE_APP_APPLE_ID;
    } else {
      process.env.APPLE_APP_APPLE_ID = originalAppAppleId;
    }
    if (originalMpToken === undefined) {
      delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    } else {
      process.env.MERCADO_PAGO_ACCESS_TOKEN = originalMpToken;
    }
    if (originalMpWebhook === undefined) {
      delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    } else {
      process.env.MERCADO_PAGO_WEBHOOK_SECRET = originalMpWebhook;
    }
    if (originalMpSandbox === undefined) {
      delete process.env.MERCADO_PAGO_SANDBOX;
    } else {
      process.env.MERCADO_PAGO_SANDBOX = originalMpSandbox;
    }
  });

  it('normaliza aliases da Apple para app_store', () => {
    expect(normalizeProviderId('app_store')).toBe('app_store');
    expect(normalizeProviderId('apple_app_store')).toBe('app_store');
    expect(normalizeProviderId('google_play')).toBe('google_play');
    expect(normalizeProviderId('pix')).toBe('pix');
    expect(normalizeProviderId('card')).toBe('card');
  });

  it('rejeita provider desconhecido', () => {
    expect(() => normalizeProviderId('paypal')).toThrow(BadRequestException);
    expect(() => normalizeProviderId('')).toThrow(BadRequestException);
  });

  it('prefixa providerTxId para evitar colisão entre provedores', () => {
    expect(buildProviderTxId('google_play', 'token-1')).toBe(
      'google_play:token-1',
    );
    expect(buildProviderTxId('app_store', '1000000123')).toBe(
      'app_store:1000000123',
    );
    expect(buildProviderTxId('pix', 'pay_1')).toBe('pix:pay_1');
    expect(buildProviderTxId('card', 'ORD01CARD')).toBe('card:ORD01CARD');
    expect(buildProviderTxId('google_play', 'token-1')).not.toBe(
      buildProviderTxId('app_store', 'token-1'),
    );
    expect(buildProviderTxId('card', 'ORD01CARD')).not.toBe(
      buildProviderTxId('pix', 'ORD01CARD'),
    );
  });

  it('extrai Order id persistido e ignora placeholders PIX', () => {
    expect(pixOrderIdFromProviderTxId('pix:ORD01TESTPIX')).toBe('ORD01TESTPIX');
    expect(pixOrderIdFromProviderTxId('pix:pending:abc')).toBeNull();
    expect(pixOrderIdFromProviderTxId('pix:duplicate:p1')).toBeNull();
    expect(pixOrderIdFromProviderTxId('google_play:order-1')).toBeNull();
    expect(pixOrderIdFromProviderTxId('card:ORD01CARD')).toBeNull();
  });

  it('extrai Order id do cartão e ignora a operação em andamento', () => {
    expect(cardOrderIdFromProviderTxId('card:ORD01CARD')).toBe('ORD01CARD');
    expect(cardOrderIdFromProviderTxId('card:op:cpabc:deadbeef')).toBeNull();
    expect(cardOrderIdFromProviderTxId('card:pending:abc')).toBeNull();
    expect(cardOrderIdFromProviderTxId('card:duplicate:p1')).toBeNull();
    expect(cardOrderIdFromProviderTxId('pix:ORD01CARD')).toBeNull();
    expect(cardOrderIdFromProviderTxId('card:12345')).toBeNull();
  });

  it('Apple sem credenciais em production falha e não inventa validação', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APPLE_SHARED_SECRET;
    delete process.env.APPLE_APP_APPLE_ID;
    const apple = new AppleAppStorePaymentProvider();
    expect(apple.isConfigured).toBe(false);
    await expect(
      apple.verify({
        productId: 'after.credits.1',
        purchaseId: '1000000123',
        verificationData: 'receipt',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PIX sem token recusa create e webhook', async () => {
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const pix = new PixPaymentProvider();
    expect(pix.isConfigured).toBe(false);
    expect(pix.id).toBe('pix');
    await expect(
      pix.createCharge({
        purchaseId: 'p1',
        packageKey: 'unit_1',
        amountBrl: 25,
        payerEmail: 'venue@test.com',
        idempotencyKey: 'idem-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(() => pix.verify({})).toThrow(BadRequestException);
  });
});

describe('Mercado Pago Orders mapping + webhook HMAC', () => {
  it('mapeia status da Orders API para PurchaseStatus', () => {
    expect(mapMercadoPagoOrderStatus('processed', 'accredited')).toBe('PAID');
    expect(mapMercadoPagoOrderStatus('action_required', 'waiting_transfer')).toBe(
      'PENDING',
    );
    expect(mapMercadoPagoOrderStatus('processing', 'in_process')).toBe('PENDING');
    expect(mapMercadoPagoOrderStatus('created', 'created')).toBe('PENDING');
    expect(mapMercadoPagoOrderStatus('failed', 'failed')).toBe('FAILED');
    expect(mapMercadoPagoOrderStatus('canceled', 'canceled')).toBe('CANCELLED');
    expect(mapMercadoPagoOrderStatus('cancelled', 'cancelled')).toBe('CANCELLED');
    expect(mapMercadoPagoOrderStatus('expired', 'expired')).toBe('CANCELLED');
    expect(mapMercadoPagoOrderStatus('refunded', 'refunded')).toBe('REFUNDED');
    expect(mapMercadoPagoOrderStatus('processed', 'partially_refunded')).toBe(
      'REFUNDED',
    );
    expect(mapMercadoPagoOrderStatus('charged_back', 'settled')).toBe('REFUNDED');
  });

  it('extrai Order id do body oficial e ignora o id envelope 123456', () => {
    expect(
      extractMercadoPagoOrderId({
        action: 'order.processed',
        api_version: 'v1',
        type: 'order',
        id: '123456',
        data: { id: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3' },
      }),
    ).toBe('ORD01JQ4S4KY8HWQ6NA5PXB65B3D3');
  });

  it('extrai data.id aninhado na query (parser Express qs)', () => {
    expect(
      extractMercadoPagoOrderId(
        {},
        { data: { id: 'ORD01TESTPIX' }, type: 'order' },
      ),
    ).toBe('ORD01TESTPIX');
    expect(
      extractMercadoPagoOrderId({}, { 'data.id': 'ORD01TESTPIX' }),
    ).toBe('ORD01TESTPIX');
  });

  it('não trata data.id numérico como Order id', () => {
    expect(
      extractMercadoPagoOrderId(
        { type: 'order', id: '123456', data: { id: '123456' } },
        { data: { id: '123456' }, type: 'order' },
      ),
    ).toBeNull();
  });

  it('aceita a ordem em maiúsculas com a caixa original e rejeita o manifesto em minúsculas', () => {
    const secret = 'whsec_test';
    const dataId = 'ORDTST01M4EJXGH4C0JXW2Z603Y25GBB';
    const requestId = '2066ca19-c6f1-498a-be75-1923005edd06';
    const ts = '1742505638683';
    const sign = (id: string) =>
      createHmac('sha256', secret)
        .update(`id:${id};request-id:${requestId};ts:${ts};`)
        .digest('hex');

    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        xSignature: `ts=${ts},v1=${sign(dataId)}`,
        xRequestId: requestId,
        dataId,
      }),
    ).toBe(true);
    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        xSignature: `ts=${ts},v1=${sign(dataId.toLowerCase())}`,
        xRequestId: requestId,
        dataId,
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        xSignature: `ts=${ts},v1=${'0'.repeat(64)}`,
        xRequestId: requestId,
        dataId,
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoWebhookSignature({
        secret: 'whsec_other',
        xSignature: `ts=${ts},v1=${sign(dataId)}`,
        xRequestId: requestId,
        dataId,
      }),
    ).toBe(false);
  });

  it('confere o manifesto literal da documentação e não trata o v1 ilustrativo como vetor', () => {
    const secret = 'whsec_documented_template';
    const dataId = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';
    const requestId = '2066ca19-c6f1-498a-be75-1923005edd06';
    const ts = '1742505638683';
    const manifest = 'id:ORD01JQ4S4KY8HWQ6NA5PXB65B3D3;request-id:2066ca19-c6f1-498a-be75-1923005edd06;ts:1742505638683;';
    const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
    const illustrated =
      'ced36ab6d33566bb1e16c125819b8d840d6b8ef136b0b9127c76064466f5229b';

    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        xSignature: `ts=${ts}, v1=${v1}`,
        xRequestId: ` ${requestId} `,
        dataId: ` ${dataId} `,
      }),
    ).toBe(true);
    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        xSignature: `ts=${ts},v1=${illustrated}`,
        xRequestId: requestId,
        dataId,
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        xSignature: `ts=${ts},v1=${createHmac('sha256', secret).update(`id:${dataId};ts:${ts};`).digest('hex')}`,
        dataId,
      }),
    ).toBe(true);
    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        xSignature: `ts=${ts},v1=${createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex')}`,
        xRequestId: `${requestId}, outro-request`,
        dataId,
      }),
    ).toBe(false);
  });

  it('não inclui Access Token na mensagem sanitizada', () => {
    const leaked =
      'Authorization: Bearer APP_USR-abc.def-123 failed for MERCADO_PAGO_ACCESS_TOKEN=APP_USR-abc';
    const sanitized = sanitizeProviderError(leaked);
    expect(sanitized).not.toContain('APP_USR-abc');
    expect(sanitized).not.toMatch(/Bearer\s+APP_USR/i);
  });

  it('HTTP 402 preserva campos seguros de diagnóstico e não vaza credenciais', () => {
    const body = {
      status: 'failed',
      status_code: 402,
      error: 'failed',
      message: 'There was an error processing one of the transactions',
      status_detail: 'failed',
      description: 'AFTER créditos unit_1',
      authorization: 'Bearer APP_USR-prod-secret-token',
      access_token: 'APP_USR-prod-secret-token',
      payer: { email: 'venue@test.com' },
      errors: [
        {
          code: 'failed',
          message: 'Collector is not able to receive PIX',
          status_detail: 'processing_error',
        },
      ],
      cause: [
        {
          code: 2167,
          description: 'PIX unavailable for this collector',
          data: 'agency=0001 account=12345-6',
        },
      ],
      transactions: {
        payments: [
          {
            status: 'failed',
            status_detail: 'processing_error',
            payment_method: {
              id: 'pix',
              qr_code: '00020126secret-pix-payload',
              token: 'card-token-should-not-log',
            },
          },
        ],
      },
    };

    const details = mercadoPagoErrorLogDetails(body);
    const logged = formatMercadoPagoErrorLog(body);

    expect(details.status).toBe('failed');
    expect(details.status_code).toBe(402);
    expect(details.code).toBe('failed');
    expect(details.error).toBe('failed');
    expect(details.message).toBe('Collector is not able to receive PIX');
    expect(details.status_detail).toBe('processing_error');
    expect(details.cause).toEqual([
      { code: 2167, description: 'PIX unavailable for this collector' },
    ]);
    expect(details).not.toHaveProperty('description');
    expect(details).not.toHaveProperty('authorization');
    expect(details).not.toHaveProperty('access_token');
    expect(details).not.toHaveProperty('payer');
    expect(details).not.toHaveProperty('transactions');
    expect(logged).toContain('Collector is not able to receive PIX');
    expect(logged).toContain('processing_error');
    expect(logged).toContain('PIX unavailable for this collector');
    expect(logged).not.toContain('APP_USR-prod-secret-token');
    expect(logged).not.toContain('Bearer ');
    expect(logged).not.toContain('00020126secret-pix-payload');
    expect(logged).not.toContain('card-token-should-not-log');
    expect(logged).not.toContain('agency=0001');
    expect(logged).not.toContain('AFTER créditos unit_1');
  });

  it('redige Access Token embutido em message de um HTTP 402', () => {
    const logged = formatMercadoPagoErrorLog({
      status: 402,
      error: 'failed',
      message: 'rejected Authorization: Bearer APP_USR-secret.jwt-token',
    });
    expect(logged).toContain('402');
    expect(logged).toContain('failed');
    expect(logged).toContain('Bearer [redacted]');
    expect(logged).not.toContain('APP_USR-secret');
  });
});

describe('normalizePixPayerEmail', () => {
  it('aceita e-mail válido e normaliza espaços/caixa', () => {
    expect(normalizePixPayerEmail('  Venue@After.COM  ')).toBe('venue@after.com');
    expect(normalizePixPayerEmail('venue@test.com')).toBe('venue@test.com');
  });

  it('rejeita ausente, formato inválido, @testuser.com e TLD reservado', () => {
    expect(normalizePixPayerEmail(undefined)).toBeNull();
    expect(normalizePixPayerEmail('')).toBeNull();
    expect(normalizePixPayerEmail('   ')).toBeNull();
    expect(normalizePixPayerEmail('nao-e-email')).toBeNull();
    expect(normalizePixPayerEmail('soseubar@after.local')).toBeNull();
    expect(normalizePixPayerEmail('test_user_br@testuser.com')).toBeNull();
    expect(normalizePixPayerEmail('user@localhost')).toBeNull();
  });
});

describe('PixPaymentProvider Mercado Pago Orders', () => {
  const originalToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const originalSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  const originalSandbox = process.env.MERCADO_PAGO_SANDBOX;
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalToken === undefined) delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    else process.env.MERCADO_PAGO_ACCESS_TOKEN = originalToken;
    if (originalSecret === undefined) delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    else process.env.MERCADO_PAGO_WEBHOOK_SECRET = originalSecret;
    if (originalSandbox === undefined) delete process.env.MERCADO_PAGO_SANDBOX;
    else process.env.MERCADO_PAGO_SANDBOX = originalSandbox;
  });

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.MERCADO_PAGO_SANDBOX;
  });

  function providerWithClient(mp: {
    createOrder?: jest.Mock;
    getOrder?: jest.Mock;
  }) {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-test-token-secret';
    const client = {
      createOrder: mp.createOrder ?? jest.fn(),
      getOrder: mp.getOrder ?? jest.fn(),
    } as unknown as MercadoPagoOrdersClient;
    return new PixPaymentProvider(client);
  }

  it('createCharge envia valor do catálogo e devolve QR do provedor como PENDING', async () => {
    const createOrder = jest.fn().mockResolvedValue({
      status: 201,
      data: mpPixOrder(),
    });
    const pix = providerWithClient({ createOrder });

    const result = await pix.createCharge({
      purchaseId: 'purchase-1',
      packageKey: 'unit_1',
      amountBrl: 34.9,
      payerEmail: 'venue@test.com',
      payerName: 'Venue Owner',
      idempotencyKey: 'idem-1',
    });

    expect(createOrder).toHaveBeenCalledTimes(1);
    const [, idempotencyKey, body] = createOrder.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(idempotencyKey).toBe('idem-1');
    expect(body.total_amount).toBe('34.90');
    expect(body.external_reference).toBe('purchase-1');
    const tx = body.transactions as {
      payments: Array<{ amount: string; payment_method: { id: string } }>;
    };
    expect(tx.payments[0].amount).toBe('34.90');
    expect(tx.payments[0].payment_method.id).toBe('pix');
    expect((body.payer as { email: string }).email).toBe('venue@test.com');
    expect((body.payer as { email: string }).email).not.toContain('@testuser.com');
    expect(result.qrCodeText).toBe('00020126copia-e-cola');
    expect(result.qrCodeImage).toContain('aGVsbG8=');
    expect(result.orderId).toBe('ORD01TESTPIX');
    expect(result.expiresAt).toBe('2026-08-26T12:00:00.000Z');
  });

  it('erro da API Mercado Pago não expõe o Access Token', async () => {
    const createOrder = jest.fn().mockResolvedValue({
      status: 401,
      data: {
        message: 'invalid access token APP_USR-test-token-secret',
        error: 'unauthorized',
      },
    });
    const pix = providerWithClient({ createOrder });

    try {
      await pix.createCharge({
        purchaseId: 'purchase-1',
        packageKey: 'unit_1',
        amountBrl: 25,
        payerEmail: 'venue@test.com',
        idempotencyKey: 'idem-1',
      });
      throw new Error('expected createCharge to fail');
    } catch (err) {
      const exception = err as ServiceUnavailableException;
      const serialized = JSON.stringify(
        exception.getResponse?.() ?? exception.message ?? err,
      );
      expect(serialized).not.toContain('APP_USR-test-token-secret');
      expect(String(exception.message)).not.toContain('APP_USR-test-token-secret');
    }
  });

  it('HTTP 402 registra detalhes seguros do Mercado Pago sem vazar credenciais', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const createOrder = jest.fn().mockResolvedValue({
      status: 402,
      data: {
        status: 'failed',
        status_code: 402,
        error: 'failed',
        message: 'There was an error processing one of the transactions',
        errors: [
          {
            code: 'failed',
            message: 'Collector is not able to receive PIX',
            status_detail: 'processing_error',
          },
        ],
        cause: [
          {
            code: 2167,
            description: 'PIX unavailable for this collector',
            data: 'agency=0001 account=12345-6',
          },
        ],
        authorization: 'Bearer APP_USR-test-token-secret',
        transactions: {
          payments: [
            {
              status: 'failed',
              status_detail: 'processing_error',
              payment_method: {
                qr_code: '00020126secret-pix-payload',
              },
            },
          ],
        },
      },
    });
    const pix = providerWithClient({ createOrder });

    try {
      await expect(
        pix.createCharge({
          purchaseId: 'purchase-1',
          packageKey: 'unit_1',
          amountBrl: 25,
          payerEmail: 'venue@test.com',
          idempotencyKey: 'idem-402',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      const logged = errorSpy.mock.calls.map((call) => String(call[0])).join('\n');

      expect(logged).toContain('Mercado Pago create order failed (402)');
      expect(logged).toContain('Collector is not able to receive PIX');
      expect(logged).toContain('processing_error');
      expect(logged).toContain('2167');
      expect(logged).toContain('PIX unavailable for this collector');
      expect(logged).not.toContain('APP_USR-test-token-secret');
      expect(logged).not.toMatch(/Bearer\s+APP_USR/i);
      expect(logged).not.toContain('00020126secret-pix-payload');
      expect(logged).not.toContain('agency=0001');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('rejeita webhook com HMAC inválido quando o secret está configurado', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'whsec_test';
    const pix = providerWithClient({});
    expect(() =>
      pix.assertWebhookSignature({
        xSignature: 'ts=1,v1=deadbeef',
        xRequestId: 'req-1',
        query: { 'data.id': 'ORD01TESTPIX' },
      }),
    ).toThrow(UnauthorizedException);
  });

  it('HMAC usa o data.id da query na caixa original e ignora um body diferente', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'whsec_test';
    const dataId = 'ORDTST01M4EJXGH4C0JXW2Z603Y25GBB';
    const requestId = '2066ca19-c6f1-498a-be75-1923005edd06';
    const ts = '1742505638683';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', 'whsec_test').update(manifest).digest('hex');
    const pix = providerWithClient({});
    const payload = {
      action: 'order.updated',
      type: 'order',
      id: '123456',
      data: { id: '123456' },
    };
    const query = { data: { id: dataId }, type: 'order' };
    const logged = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      expect(() =>
        pix.assertWebhookSignature(
          { xSignature: `ts=${ts},v1=${v1}`, xRequestId: requestId, query },
          payload,
        ),
      ).not.toThrow();
      expect(pix.extractOrderId(payload, query)).toBe(dataId);
      const line = logged.mock.calls.map((call) => String(call[0])).join('\n');
      expect(line).toContain('signature accepted');
      expect(line).toContain('source=query');
      expect(line).toContain('format=alphanumeric');
      expect(line).toContain('case=upper');
      expect(line).toContain('normalized=original');
      expect(line).toContain('mismatch=true');
      expect(line).not.toContain(dataId);
      expect(line).not.toContain('whsec_test');
      expect(line).not.toContain(v1);
    } finally {
      logged.mockRestore();
    }
  });

  it('rejeita webhook sem x-signature, sem x-request-id assinado e com segredo errado', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'whsec_test';
    const dataId = '123456';
    const ts = '1742505638683';
    const requestId = 'req-1';
    const pix = providerWithClient({});
    const signed = (manifest: string, secret = 'whsec_test') =>
      createHmac('sha256', secret).update(manifest).digest('hex');
    const query = { 'data.id': dataId };

    expect(() => pix.assertWebhookSignature({ query }, { data: { id: dataId } })).toThrow(
      UnauthorizedException,
    );

    const withoutRequest = `id:${dataId};ts:${ts};`;
    expect(() =>
      pix.assertWebhookSignature(
        { xSignature: `ts=${ts},v1=${signed(withoutRequest)}`, query },
        { data: { id: dataId } },
      ),
    ).not.toThrow();

    const withRequest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    expect(() =>
      pix.assertWebhookSignature(
        { xSignature: `ts=${ts},v1=${signed(withRequest)}`, query },
        { data: { id: dataId } },
      ),
    ).toThrow(UnauthorizedException);

    expect(() =>
      pix.assertWebhookSignature(
        {
          xSignature: `ts=${ts},v1=${signed(withRequest, 'whsec_other')}`,
          xRequestId: requestId,
          query,
        },
        { data: { id: dataId } },
      ),
    ).toThrow(UnauthorizedException);

    const numeric = inspectMercadoPagoWebhookSignature({
      payload: { data: { id: dataId } },
      query,
      xSignature: `ts=${ts},v1=${signed(withoutRequest)}`,
    });
    expect(numeric.format).toBe('numeric');
    expect(formatMercadoPagoWebhookSignatureLog('accepted', numeric)).toContain(
      'format=numeric',
    );
  });

  it('sandbox=true usa e-mail @testuser.com e first_name APRO, ignorando o pagador real', async () => {
    process.env.NODE_ENV = 'test';
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-access-token';
    const createOrder = jest.fn().mockResolvedValue({
      status: 201,
      data: mpPixOrder(),
    });
    const pix = providerWithClient({ createOrder });
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-access-token';

    await pix.createCharge({
      purchaseId: 'purchase-1',
      packageKey: 'unit_1',
      amountBrl: 25,
      payerEmail: 'venue@after.local',
      payerName: 'Venue Owner',
      idempotencyKey: 'idem-sandbox',
    });

    const body = createOrder.mock.calls[0][2] as {
      payer: { email: string; first_name?: string; last_name?: string };
    };
    expect(body.payer.email).toBe(MERCADO_PAGO_SANDBOX_PAYER.email);
    expect(body.payer.email).toContain('@testuser.com');
    expect(body.payer.first_name).toBe('APRO');
    expect(body.payer.last_name).toBeUndefined();
    expect(body.payer.email).not.toBe('venue@after.local');
  });

  it('sandbox=false usa o e-mail real normalizado e nunca injeta @testuser.com', async () => {
    process.env.NODE_ENV = 'test';
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    const createOrder = jest.fn().mockResolvedValue({
      status: 201,
      data: mpPixOrder(),
    });
    const pix = providerWithClient({ createOrder });

    await pix.createCharge({
      purchaseId: 'purchase-1',
      packageKey: 'unit_1',
      amountBrl: 25,
      payerEmail: '  Venue@After.COM  ',
      payerName: 'Venue Owner',
      idempotencyKey: 'idem-live',
    });

    const body = createOrder.mock.calls[0][2] as {
      payer: { email: string; first_name?: string };
    };
    expect(body.payer.email).toBe('venue@after.com');
    expect(body.payer.email).not.toContain('@testuser.com');
    expect(body.payer.first_name).toBe('Venue');
  });

  it('produção + sandbox=true rejeita a cobrança sem chamar o Mercado Pago', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    const createOrder = jest.fn();
    const pix = providerWithClient({ createOrder });

    try {
      await pix.createCharge({
        purchaseId: 'purchase-1',
        packageKey: 'unit_1',
        amountBrl: 25,
        payerEmail: 'venue@after.local',
        idempotencyKey: 'idem-prod',
      });
      throw new Error('expected createCharge to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      const exception = err as ServiceUnavailableException;
      const serialized = JSON.stringify(exception.getResponse?.() ?? exception.message);
      expect(serialized).toContain('Sandbox');
      expect(serialized).not.toContain('APP_USR-test-token-secret');
      expect(serialized).not.toContain('whsec_test');
    }
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('sandbox aceita Access Token APP_USR das credenciais de teste', async () => {
    process.env.NODE_ENV = 'test';
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    const createOrder = jest.fn().mockResolvedValue({
      status: 201,
      data: mpPixOrder(),
    });
    const pix = providerWithClient({ createOrder });

    await pix.createCharge({
      purchaseId: 'purchase-1',
      packageKey: 'unit_1',
      amountBrl: 25,
      payerEmail: 'venue@after.com',
      idempotencyKey: 'idem-test-app-usr',
    });
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('produção com credencial de teste não cria PIX', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    const createOrder = jest.fn();
    const pix = providerWithClient({ createOrder });
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-access-token';

    await expect(
      pix.createCharge({
        purchaseId: 'purchase-1',
        packageKey: 'unit_1',
        amountBrl: 25,
        payerEmail: 'venue@after.com',
        idempotencyKey: 'idem-test-token',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('produção com credencial APP_USR e sandbox desligado cria PIX', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    const createOrder = jest.fn().mockResolvedValue({
      status: 201,
      data: mpPixOrder(),
    });
    const pix = providerWithClient({ createOrder });

    await pix.createCharge({
      purchaseId: 'purchase-1',
      packageKey: 'unit_1',
      amountBrl: 25,
      payerEmail: 'venue@after.com',
      idempotencyKey: 'idem-live-prod',
    });
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('fora do sandbox, ausência de e-mail real é rejeitada', async () => {
    process.env.NODE_ENV = 'test';
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    const createOrder = jest.fn();
    const pix = providerWithClient({ createOrder });

    await expect(
      pix.createCharge({
        purchaseId: 'purchase-1',
        packageKey: 'unit_1',
        amountBrl: 25,
        idempotencyKey: 'idem-no-email',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('fora do sandbox rejeita e-mail .local, @testuser.com e formato inválido', async () => {
    process.env.NODE_ENV = 'test';
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    const createOrder = jest.fn();
    const pix = providerWithClient({ createOrder });

    for (const payerEmail of [
      'soseubar@after.local',
      'test_user_br@testuser.com',
      'nao-e-email',
      'venue@',
    ]) {
      try {
        await pix.createCharge({
          purchaseId: 'purchase-1',
          packageKey: 'unit_1',
          amountBrl: 25,
          payerEmail,
          idempotencyKey: `idem-invalid-${payerEmail}`,
        });
        throw new Error(`expected reject for ${payerEmail}`);
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const serialized = JSON.stringify(
          (err as BadRequestException).getResponse?.() ?? err,
        );
        expect(serialized).toContain(PIX_INVALID_PAYER_EMAIL_MESSAGE);
        expect(serialized).not.toContain(payerEmail);
      }
    }
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('GET PIX distingue reembolso integral, parcial, moeda e dados ausentes', async () => {
    const read = async (data: Record<string, unknown>) => {
      const pix = providerWithClient({
        getOrder: jest.fn().mockResolvedValue({ status: 200, data }),
      });
      return pix.getOrder('ORD01TESTPIX');
    };

    const full = await read(
      mpPixOrder({
        status: 'refunded',
        status_detail: 'refunded',
        currency: 'brl',
        total_amount: '34.90',
      }),
    );
    expect(full.status).toBe('REFUNDED');
    expect(full.refundProof).toBe('full');
    expect(full.currency).toBe('BRL');
    expect(full.amountBrl).toBe(34.9);

    const partial = await read(
      mpPixOrder({ status: 'processed', status_detail: 'partially_refunded', currency: 'BRL' }),
    );
    expect(partial.status).toBe('REFUNDED');
    expect(partial.refundProof).toBe('partial');

    const detailOnly = await read(
      mpPixOrder({ status: 'processed', status_detail: 'refunded', currency: 'BRL' }),
    );
    expect(detailOnly.refundProof).toBe('full');

    const unproven = await read(
      mpPixOrder({ status: 'processed', status_detail: 'refund_in_process', currency: 'BRL' }),
    );
    expect(unproven.status).toBe('REFUNDED');
    expect(unproven.refundProof).toBe('unproven');

    const usd = await read(mpPixOrder({ status: 'refunded', currency: 'USD' }));
    expect(usd.currency).toBe('USD');

    const absent = await read(mpPixOrder({ status: 'refunded', currency: '', currency_id: '' }));
    expect(absent.currency).toBeNull();

    const conflict = await read(
      mpPixOrder({ status: 'refunded', currency: 'USD', currency_id: 'BRL' }),
    );
    expect(conflict.currency).toBeNull();

    const barePartial = await read(
      mpPixOrder({
        status: 'processed',
        status_detail: 'partially_refunded',
        currency: 'BRL',
      }),
    );
    expect(barePartial.refundProof).toBe('partial');
    expect(barePartial.provenPartialRefund).toBeNull();

    const proved = await read(
      mpPixOrder({
        status: 'processed',
        status_detail: 'partially_refunded',
        currency: 'BRL',
        total_amount: '34.90',
        transactions: {
          payments: [
            {
              id: 'PAY01TESTPIX',
              status: 'processed',
              status_detail: 'partially_refunded',
              amount: '34.90',
              payment_method: { id: 'pix', type: 'bank_transfer' },
            },
          ],
          refunds: [
            {
              id: 'REF-PIX-1',
              status: 'processed',
              amount: '10.00',
              transaction_id: 'PAY01TESTPIX',
            },
          ],
        },
      }),
    );
    expect(proved.provenPartialRefund).toEqual({
      refundedAmountBrl: 10,
      refundId: 'REF-PIX-1',
    });
    expect(proved.amountBrl).toBe(34.9);
  });
});
