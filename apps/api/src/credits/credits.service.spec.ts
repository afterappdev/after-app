import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CREDIT_PACKAGES } from '../common/constants/credits';
import { CreditsService } from './credits.service';
import { AppleAppStorePaymentProvider } from './providers/apple-app-store.provider';
import { PixPaymentProvider } from './providers/pix.provider';
import { PaymentProviderRegistry } from './providers/payment-providers';
import { VerifiedPayment } from './providers/payment-provider';

const USER_ID = 'user-1';
const VENUE = {
  id: 'venue-1',
  ownerUserId: USER_ID,
  owner: { email: 'venue@test.com', name: 'Venue Owner' },
};

const UNIT = CREDIT_PACKAGES.find((p) => p.key === 'unit_1')!;

function createPrisma() {
  const prisma: {
    venue: { findUnique: jest.Mock };
    creditPurchase: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    creditWallet: { findUnique: jest.Mock; upsert: jest.Mock };
    $transaction: jest.Mock;
  } = {
    venue: { findUnique: jest.fn() },
    creditPurchase: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    creditWallet: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
    fn(prisma),
  );
  prisma.venue.findUnique.mockResolvedValue(VENUE);
  return prisma;
}

describe('CreditsService billing', () => {
  const originalEnv = { ...process.env };
  let prisma: ReturnType<typeof createPrisma>;
  let googleVerify: jest.Mock<Promise<VerifiedPayment>, [unknown]>;
  let payments: {
    storeProvider: jest.Mock;
    pixProvider: jest.Mock;
  };
  let service: CreditsService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.APPLE_SHARED_SECRET;
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    delete process.env.MERCADO_PAGO_SANDBOX;
    prisma = createPrisma();
    googleVerify = jest.fn();
    payments = {
      storeProvider: jest.fn().mockReturnValue({
        id: 'google_play',
        verify: googleVerify,
      }),
      pixProvider: jest.fn().mockReturnValue(new PixPaymentProvider()),
    };
    service = new CreditsService(
      prisma as never,
      payments as unknown as PaymentProviderRegistry,
    );
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    if (originalEnv.APPLE_SHARED_SECRET === undefined) {
      delete process.env.APPLE_SHARED_SECRET;
    } else {
      process.env.APPLE_SHARED_SECRET = originalEnv.APPLE_SHARED_SECRET;
    }
    if (originalEnv.MERCADO_PAGO_ACCESS_TOKEN === undefined) {
      delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    } else {
      process.env.MERCADO_PAGO_ACCESS_TOKEN = originalEnv.MERCADO_PAGO_ACCESS_TOKEN;
    }
    if (originalEnv.MERCADO_PAGO_WEBHOOK_SECRET === undefined) {
      delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    } else {
      process.env.MERCADO_PAGO_WEBHOOK_SECRET =
        originalEnv.MERCADO_PAGO_WEBHOOK_SECRET;
    }
    if (originalEnv.MERCADO_PAGO_SANDBOX === undefined) {
      delete process.env.MERCADO_PAGO_SANDBOX;
    } else {
      process.env.MERCADO_PAGO_SANDBOX = originalEnv.MERCADO_PAGO_SANDBOX;
    }
  });

  const storeDto = {
    packageKey: 'unit_1' as const,
    productId: 'after.credits.1',
    provider: 'google_play',
    purchaseId: 'gp-1',
    verificationData: 'token-abc',
  };

  it('bloqueia dev-confirm em production sem creditar a wallet', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      service.confirmPurchaseDev(USER_ID, 'purchase-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejeita productId desconhecido sem creditar', async () => {
    googleVerify.mockResolvedValue({
      provider: 'google_play',
      productId: 'after.credits.unknown',
      externalId: 'order-x',
    });
    await expect(
      service.confirmStorePurchase(USER_ID, {
        ...storeDto,
        productId: 'after.credits.unknown',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('rejeita packageKey incompatível com o productId sem creditar', async () => {
    googleVerify.mockResolvedValue({
      provider: 'google_play',
      productId: UNIT.storeProductId,
      externalId: 'order-1',
    });
    await expect(
      service.confirmStorePurchase(USER_ID, {
        ...storeDto,
        packageKey: 'combo_5',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('não credita a mesma transação duas vezes', async () => {
    googleVerify.mockResolvedValue({
      provider: 'google_play',
      productId: UNIT.storeProductId,
      externalId: 'order-dup',
    });
    const paid = {
      id: 'p1',
      venueId: VENUE.id,
      status: 'PAID',
      providerTxId: 'google_play:order-dup',
      credits: UNIT.credits,
    };
    prisma.creditPurchase.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(paid);
    prisma.creditPurchase.create.mockResolvedValue(paid);
    prisma.creditWallet.upsert.mockResolvedValue({
      venueId: VENUE.id,
      balance: UNIT.credits,
    });

    const first = await service.confirmStorePurchase(USER_ID, storeDto);
    const second = await service.confirmStorePurchase(USER_ID, storeDto);

    expect(first.status).toBe('PAID');
    expect(first.id).toBe('p1');
    expect(second.id).toBe('p1');
    expect(second.status).toBe('PAID');
    expect(prisma.creditPurchase.create).toHaveBeenCalledTimes(1);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledWith({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: UNIT.credits },
      update: { balance: { increment: UNIT.credits } },
    });
  });

  it('rejeita provider inválido sem creditar', async () => {
    await expect(
      service.confirmStorePurchase(USER_ID, {
        ...storeDto,
        provider: 'stripe',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(payments.storeProvider).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('não credita Apple sem configuração em production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APPLE_SHARED_SECRET;
    payments.storeProvider.mockReturnValue(new AppleAppStorePaymentProvider());

    await expect(
      service.confirmStorePurchase(USER_ID, {
        ...storeDto,
        provider: 'app_store',
        purchaseId: '1000000123',
        verificationData: 'fake-receipt',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
  });

  it('PIX não configurado não credita (create e webhook)', async () => {
    await expect(
      service.createPixCharge(USER_ID, 'unit_1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.handlePixWebhook({ paid: true })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
  });

  it('produção + sandbox=true rejeita PIX sem criar compra', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    payments.pixProvider.mockReturnValue({
      id: 'pix',
      isConfigured: true,
      createCharge: jest.fn(),
    });
    await expect(service.createPixCharge(USER_ID, 'unit_1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('fora do sandbox rejeita PIX sem e-mail real no perfil', async () => {
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    payments.pixProvider.mockReturnValue({
      id: 'pix',
      isConfigured: true,
      createCharge: jest.fn(),
    });
    prisma.venue.findUnique.mockResolvedValue({
      id: VENUE.id,
      ownerUserId: USER_ID,
      owner: { email: '  ', name: 'Venue' },
    });
    await expect(service.createPixCharge(USER_ID, 'unit_1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
  });

  it('pix/create só recebe packageKey — pagador não vem do frontend', async () => {
    expect(service.createPixCharge.length).toBe(2);
    const createCharge = jest.fn().mockResolvedValue({
      orderId: 'ORD01TESTPIX',
      paymentId: 'PAY01TESTPIX',
      qrCodeText: '00020126copia-e-cola',
      qrCodeImage: 'data:image/png;base64,aGVsbG8=',
      expiresAt: null,
    });
    payments.pixProvider.mockReturnValue({
      id: 'pix',
      isConfigured: true,
      createCharge,
    });
    prisma.creditPurchase.create.mockResolvedValue(
      pixPurchase({ status: 'PENDING' }),
    );
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({ status: 'PENDING' }),
    );
    await service.createPixCharge(USER_ID, 'unit_1');
    const payload = createCharge.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ['amountBrl', 'idempotencyKey', 'packageKey', 'payerEmail', 'payerName', 'purchaseId'].sort(),
    );
    expect(payload.payerEmail).toBe('venue@test.com');
    expect(payload.payerEmail).not.toContain('@testuser.com');
  });

  it('pix/create rejeita packageKey inválido', async () => {
    await expect(
      service.createPixCharge(USER_ID, 'invalid_pack' as 'unit_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('pix/create usa valor do catálogo e retorna PENDING com QR do provedor', async () => {
    const createCharge = jest.fn().mockResolvedValue({
      orderId: 'ORD01TESTPIX',
      paymentId: 'PAY01TESTPIX',
      qrCodeText: '00020126copia-e-cola',
      qrCodeImage: 'data:image/png;base64,aGVsbG8=',
      expiresAt: '2026-08-26T12:00:00.000Z',
    });
    payments.pixProvider.mockReturnValue({
      id: 'pix',
      isConfigured: true,
      createCharge,
    });
    const pending = pixPurchase({ status: 'PENDING', providerTxId: 'pix:pending:1' });
    const saved = pixPurchase({
      status: 'PENDING',
      providerTxId: 'pix:ORD01TESTPIX',
    });
    prisma.creditPurchase.create.mockResolvedValue(pending);
    prisma.creditPurchase.update.mockResolvedValue(saved);

    const result = await service.createPixCharge(USER_ID, 'unit_1');

    expect(result.status).toBe('PENDING');
    expect(result.amount).toBe(UNIT.priceBrl);
    expect(result.currency).toBe('BRL');
    expect(result.qrCodeText).toBe('00020126copia-e-cola');
    expect(result.paymentId).toBe('PAY01TESTPIX');
    expect(createCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        packageKey: 'unit_1',
        amountBrl: 25,
        payerEmail: 'venue@test.com',
      }),
    );
    expect(createCharge.mock.calls[0][0].amountBrl).toBe(UNIT.priceBrl);
    expect(prisma.creditPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'pix',
          status: 'PENDING',
          productId: null,
          amountPaid: 25,
          credits: 1,
        }),
      }),
    );
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('combo_5 cobra 115 do catálogo, não um valor enviado pelo cliente', async () => {
    const combo = CREDIT_PACKAGES.find((p) => p.key === 'combo_5')!;
    const createCharge = jest.fn().mockResolvedValue({
      orderId: 'ORD01COMBO5',
      paymentId: 'PAY01COMBO5',
      qrCodeText: '00020126combo',
      qrCodeImage: 'data:image/png;base64,combo',
      expiresAt: null,
    });
    payments.pixProvider.mockReturnValue({
      id: 'pix',
      isConfigured: true,
      createCharge,
    });
    prisma.creditPurchase.create.mockResolvedValue(
      pixPurchase({ packageKey: 'combo_5', amountPaid: 115, credits: 5 }),
    );
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({
        packageKey: 'combo_5',
        amountPaid: 115,
        credits: 5,
        providerTxId: 'pix:ORD01COMBO5',
      }),
    );

    const result = await service.createPixCharge(USER_ID, 'combo_5');
    expect(result.amount).toBe(combo.priceBrl);
    expect(result.amount).toBe(115);
    expect(createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amountBrl: 115, packageKey: 'combo_5' }),
    );
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('webhook não credita sem confirmação externa', async () => {
    const pix = mockConfiguredPix({
      extractOrderId: jest.fn().mockReturnValue('ORD01TESTPIX'),
      getOrder: jest.fn().mockResolvedValue({
        orderId: 'ORD01TESTPIX',
        paymentId: 'PAY01TESTPIX',
        status: 'PENDING',
        amountBrl: 25,
        currency: 'BRL',
        externalReference: 'pix-p1',
        expiresAt: null,
      }),
    });
    payments.pixProvider.mockReturnValue(pix);
    prisma.creditPurchase.findUnique.mockResolvedValue(
      pixPurchase({ status: 'PENDING' }),
    );

    await service.handlePixWebhook({
      action: 'order.processed',
      data: { id: 'ORD01TESTPIX' },
    });

    expect(pix.getOrder).toHaveBeenCalledWith('ORD01TESTPIX');
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.updateMany).not.toHaveBeenCalled();
  });

  it('pagamento aprovado credita uma vez e webhook duplicado não duplica', async () => {
    const pix = mockConfiguredPix({
      extractOrderId: jest.fn().mockReturnValue('ORD01TESTPIX'),
      getOrder: jest.fn().mockResolvedValue(paidOrder()),
    });
    payments.pixProvider.mockReturnValue(pix);

    let status = 'PENDING';
    prisma.creditPurchase.findUnique.mockImplementation(async () =>
      pixPurchase({
        status,
        confirmedAt: status === 'PAID' ? new Date() : null,
      }),
    );
    prisma.creditPurchase.updateMany.mockImplementation(async () => {
      if (status !== 'PENDING') return { count: 0 };
      status = 'PAID';
      return { count: 1 };
    });
    prisma.creditWallet.upsert.mockResolvedValue({
      venueId: VENUE.id,
      balance: 1,
    });

    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });
    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledWith({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
  });

  it('status falho/cancelado não credita', async () => {
    const pix = mockConfiguredPix({
      extractOrderId: jest.fn().mockReturnValue('ORD01FAIL'),
      getOrder: jest.fn().mockResolvedValue({
        ...paidOrder(),
        orderId: 'ORD01FAIL',
        status: 'FAILED',
      }),
    });
    payments.pixProvider.mockReturnValue(pix);
    prisma.creditPurchase.findUnique.mockResolvedValue(
      pixPurchase({
        status: 'PENDING',
        providerTxId: 'pix:ORD01FAIL',
      }),
    );
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({ status: 'FAILED', providerTxId: 'pix:ORD01FAIL' }),
    );

    await service.handlePixWebhook({ data: { id: 'ORD01FAIL' } });

    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );

    pix.getOrder.mockResolvedValue({
      ...paidOrder(),
      orderId: 'ORD01CANCEL',
      status: 'CANCELLED',
    });
    pix.extractOrderId.mockReturnValue('ORD01CANCEL');
    prisma.creditPurchase.findUnique.mockResolvedValue(
      pixPurchase({
        status: 'PENDING',
        providerTxId: 'pix:ORD01CANCEL',
      }),
    );
    prisma.creditWallet.upsert.mockClear();
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({ status: 'CANCELLED', providerTxId: 'pix:ORD01CANCEL' }),
    );

    await service.handlePixWebhook({ data: { id: 'ORD01CANCEL' } });
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('providerTxId PIX é idempotente na criação', async () => {
    const createCharge = jest.fn().mockResolvedValue({
      orderId: 'ORD01DUP',
      paymentId: 'PAY01DUP',
      qrCodeText: '00020126copia-e-cola',
      qrCodeImage: 'data:image/png;base64,aGVsbG8=',
      expiresAt: null,
    });
    payments.pixProvider.mockReturnValue({
      id: 'pix',
      isConfigured: true,
      createCharge,
    });
    const pending = pixPurchase({ id: 'new-p', providerTxId: 'pix:pending:x' });
    const existing = pixPurchase({
      id: 'old-p',
      providerTxId: 'pix:ORD01DUP',
    });
    prisma.creditPurchase.create.mockResolvedValue(pending);
    prisma.creditPurchase.update
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
      .mockResolvedValueOnce(
        pixPurchase({
          id: 'new-p',
          status: 'CANCELLED',
          providerTxId: 'pix:duplicate:new-p',
        }),
      );
    prisma.creditPurchase.findUnique.mockResolvedValue(existing);

    const result = await service.createPixCharge(USER_ID, 'unit_1');

    expect(result.purchaseId).toBe('old-p');
    expect(result.status).toBe('PENDING');
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('consulta da compra expõe status e não expõe providerTxId', async () => {
    prisma.creditPurchase.findUnique.mockResolvedValue(
      pixPurchase({ status: 'PAID', providerTxId: 'pix:ORDSECRET' }),
    );
    const result = await service.purchaseById(USER_ID, 'pix-p1');
    expect(result.status).toBe('PAID');
    expect(result.provider).toBe('pix');
    expect(result.amountPaid).toBe(25);
    expect(result.currency).toBe('BRL');
    expect(result).not.toHaveProperty('providerTxId');
    expect(payments.pixProvider).not.toHaveBeenCalled();
  });

  it('GET PIX PENDING + Mercado Pago processed/accredited credita uma vez', async () => {
    const pix = mockConfiguredPix({
      getOrder: jest.fn().mockResolvedValue(paidOrder()),
    });
    payments.pixProvider.mockReturnValue(pix);
    installPixClaim(prisma);

    const result = await service.purchaseById(USER_ID, 'pix-p1');

    expect(result.status).toBe('PAID');
    expect(result).not.toHaveProperty('providerTxId');
    expect(pix.getOrder).toHaveBeenCalledWith('ORD01TESTPIX');
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledWith({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
  });

  it('dois GETs simultâneos não duplicam crédito PIX', async () => {
    const pix = mockConfiguredPix({
      getOrder: jest.fn().mockResolvedValue(paidOrder()),
    });
    payments.pixProvider.mockReturnValue(pix);
    installPixClaim(prisma);

    const [a, b] = await Promise.all([
      service.purchaseById(USER_ID, 'pix-p1'),
      service.purchaseById(USER_ID, 'pix-p1'),
    ]);

    expect(a.status).toBe('PAID');
    expect(b.status).toBe('PAID');
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
  });

  it('webhook e GET simultâneos não duplicam crédito PIX', async () => {
    const pix = mockConfiguredPix({
      extractOrderId: jest.fn().mockReturnValue('ORD01TESTPIX'),
      getOrder: jest.fn().mockResolvedValue(paidOrder()),
    });
    payments.pixProvider.mockReturnValue(pix);
    installPixClaim(prisma);

    await Promise.all([
      service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } }),
      service.purchaseById(USER_ID, 'pix-p1'),
    ]);

    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
  });

  it('GET PIX continua PENDING enquanto o provedor está created/processing/action_required', async () => {
    const pix = mockConfiguredPix({
      getOrder: jest.fn().mockResolvedValue({
        ...paidOrder(),
        status: 'PENDING',
      }),
    });
    payments.pixProvider.mockReturnValue(pix);
    prisma.creditPurchase.findUnique.mockResolvedValue(pixPurchase());

    const result = await service.purchaseById(USER_ID, 'pix-p1');

    expect(result.status).toBe('PENDING');
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.updateMany).not.toHaveBeenCalled();
  });

  it('GET PIX failed/cancelled/refunded atualiza sem creditar', async () => {
    const pix = mockConfiguredPix({
      getOrder: jest.fn().mockResolvedValue({
        ...paidOrder(),
        status: 'FAILED',
      }),
    });
    payments.pixProvider.mockReturnValue(pix);
    prisma.creditPurchase.findUnique.mockResolvedValue(pixPurchase());
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({ status: 'FAILED' }),
    );

    await expect(service.purchaseById(USER_ID, 'pix-p1')).resolves.toEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();

    pix.getOrder.mockResolvedValue({ ...paidOrder(), status: 'CANCELLED' });
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({ status: 'CANCELLED' }),
    );
    await expect(service.purchaseById(USER_ID, 'pix-p1')).resolves.toEqual(
      expect.objectContaining({ status: 'CANCELLED' }),
    );

    pix.getOrder.mockResolvedValue({ ...paidOrder(), status: 'REFUNDED' });
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({ status: 'REFUNDED' }),
    );
    await expect(service.purchaseById(USER_ID, 'pix-p1')).resolves.toEqual(
      expect.objectContaining({ status: 'REFUNDED' }),
    );
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('compra Google/Apple/stub não consulta Mercado Pago no GET', async () => {
    payments.pixProvider.mockClear();
    prisma.creditPurchase.findUnique.mockResolvedValue(
      pixPurchase({
        provider: 'google_play',
        providerTxId: 'google_play:order-1',
      }),
    );
    await service.purchaseById(USER_ID, 'gp-1');
    expect(payments.pixProvider).not.toHaveBeenCalled();

    prisma.creditPurchase.findUnique.mockResolvedValue(
      pixPurchase({
        provider: 'app_store',
        providerTxId: 'app_store:100',
      }),
    );
    await service.purchaseById(USER_ID, 'ap-1');
    expect(payments.pixProvider).not.toHaveBeenCalled();

    prisma.creditPurchase.findUnique.mockResolvedValue(
      pixPurchase({
        provider: 'stub',
        providerTxId: 'stub:dev-1',
      }),
    );
    await service.purchaseById(USER_ID, 'stub-1');
    expect(payments.pixProvider).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('erro temporário do Mercado Pago no GET não credita nem marca PAID', async () => {
    const pix = mockConfiguredPix({
      getOrder: jest
        .fn()
        .mockRejectedValue(new ServiceUnavailableException('Mercado Pago down')),
    });
    payments.pixProvider.mockReturnValue(pix);
    prisma.creditPurchase.findUnique.mockResolvedValue(pixPurchase());

    const result = await service.purchaseById(USER_ID, 'pix-p1');

    expect(result.status).toBe('PENDING');
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.updateMany).not.toHaveBeenCalled();
  });

  it('wallet só aumenta após confirmação válida da loja', async () => {
    googleVerify.mockResolvedValue({
      provider: 'google_play',
      productId: UNIT.storeProductId,
      externalId: 'order-ok',
    });
    prisma.creditPurchase.findUnique.mockResolvedValue(null);
    prisma.creditPurchase.create.mockResolvedValue({
      id: 'p-ok',
      venueId: VENUE.id,
      status: 'PAID',
      providerTxId: 'google_play:order-ok',
      credits: UNIT.credits,
    });
    prisma.creditWallet.upsert.mockResolvedValue({
      venueId: VENUE.id,
      balance: UNIT.credits,
    });

    await service.checkout(USER_ID, 'unit_1');
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          provider: 'stub',
        }),
      }),
    );

    await service.confirmStorePurchase(USER_ID, storeDto);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
  });

  it('checkout em production não cria compra nem credita', async () => {
    process.env.NODE_ENV = 'production';
    await expect(service.checkout(USER_ID, 'unit_1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });
});

function pixPurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pix-p1',
    venueId: VENUE.id,
    packageKey: 'unit_1',
    productId: null,
    amountPaid: 25,
    currency: 'BRL',
    credits: 1,
    provider: 'pix',
    providerTxId: 'pix:ORD01TESTPIX',
    status: 'PENDING',
    confirmedAt: null,
    createdAt: new Date('2026-08-26T10:00:00.000Z'),
    updatedAt: new Date('2026-08-26T10:00:00.000Z'),
    ...overrides,
  };
}

function paidOrder() {
  return {
    orderId: 'ORD01TESTPIX',
    paymentId: 'PAY01TESTPIX',
    status: 'PAID' as const,
    amountBrl: 25,
    currency: 'BRL' as const,
    externalReference: 'pix-p1',
    expiresAt: null,
  };
}

function mockConfiguredPix(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pix' as const,
    isConfigured: true,
    createCharge: jest.fn(),
    getOrder: jest.fn(),
    assertWebhookSignature: jest.fn(),
    extractOrderId: jest.fn(),
    ...overrides,
  };
}

function installPixClaim(db: ReturnType<typeof createPrisma>) {
  let status = 'PENDING';
  db.creditPurchase.findUnique.mockImplementation(async () =>
    pixPurchase({
      status,
      confirmedAt: status === 'PAID' ? new Date() : null,
    }),
  );
  db.creditPurchase.updateMany.mockImplementation(async () => {
    if (status !== 'PENDING') return { count: 0 };
    status = 'PAID';
    return { count: 1 };
  });
  db.creditWallet.upsert.mockResolvedValue({
    venueId: VENUE.id,
    balance: 1,
  });
}
