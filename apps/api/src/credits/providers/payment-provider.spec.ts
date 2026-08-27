import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { AppleAppStorePaymentProvider } from './apple-app-store.provider';
import {
  extractMercadoPagoOrderId,
  mapMercadoPagoOrderStatus,
  MercadoPagoOrdersClient,
  sanitizeProviderError,
  verifyMercadoPagoWebhookSignature,
} from './mercado-pago-orders';
import {
  buildProviderTxId,
  normalizeProviderId,
  pixOrderIdFromProviderTxId,
} from './payment-provider';
import { MERCADO_PAGO_SANDBOX_PAYER, PixPaymentProvider } from './pix.provider';

function mpPixOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ORD01TESTPIX',
    status: 'action_required',
    status_detail: 'waiting_transfer',
    total_amount: '25.00',
    external_reference: 'purchase-1',
    transactions: {
      payments: [
        {
          id: 'PAY01TESTPIX',
          status: 'action_required',
          status_detail: 'waiting_transfer',
          amount: '25.00',
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
    expect(buildProviderTxId('google_play', 'token-1')).not.toBe(
      buildProviderTxId('app_store', 'token-1'),
    );
  });

  it('extrai Order id persistido e ignora placeholders PIX', () => {
    expect(pixOrderIdFromProviderTxId('pix:ORD01TESTPIX')).toBe('ORD01TESTPIX');
    expect(pixOrderIdFromProviderTxId('pix:pending:abc')).toBeNull();
    expect(pixOrderIdFromProviderTxId('pix:duplicate:p1')).toBeNull();
    expect(pixOrderIdFromProviderTxId('google_play:order-1')).toBeNull();
  });

  it('Apple sem credenciais em production falha e não inventa validação', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APPLE_SHARED_SECRET;
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

  it('valida HMAC do webhook conforme o manifesto do Mercado Pago', () => {
    const secret = 'whsec_test';
    const dataId = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';
    const requestId = '2066ca19-c6f1-498a-be75-1923005edd06';
    const ts = '1742505638683';
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', secret).update(manifest).digest('hex');

    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        xSignature: `ts=${ts},v1=${v1}`,
        xRequestId: requestId,
        dataId,
      }),
    ).toBe(true);
    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        xSignature: `ts=${ts},v1=${'0'.repeat(64)}`,
        xRequestId: requestId,
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
      amountBrl: 25,
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
    expect(body.total_amount).toBe('25.00');
    expect(body.external_reference).toBe('purchase-1');
    const tx = body.transactions as {
      payments: Array<{ amount: string; payment_method: { id: string } }>;
    };
    expect(tx.payments[0].amount).toBe('25.00');
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

  it('HMAC aceita data.id aninhado pelo parser do Express', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'whsec_test';
    const dataId = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';
    const requestId = '2066ca19-c6f1-498a-be75-1923005edd06';
    const ts = '1742505638683';
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', 'whsec_test').update(manifest).digest('hex');
    const pix = providerWithClient({});
    expect(() =>
      pix.assertWebhookSignature(
        {
          xSignature: `ts=${ts},v1=${v1}`,
          xRequestId: requestId,
          query: { data: { id: dataId }, type: 'order' },
        },
        {
          action: 'order.processed',
          type: 'order',
          id: '123456',
          data: { id: dataId },
        },
      ),
    ).not.toThrow();
  });

  it('sandbox=true usa e-mail @testuser.com e first_name APRO, ignorando o pagador real', async () => {
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

  it('sandbox=false usa o e-mail real e nunca injeta @testuser.com', async () => {
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
      payerEmail: 'venue@after.local',
      payerName: 'Venue Owner',
      idempotencyKey: 'idem-live',
    });

    const body = createOrder.mock.calls[0][2] as {
      payer: { email: string; first_name?: string };
    };
    expect(body.payer.email).toBe('venue@after.local');
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
});
