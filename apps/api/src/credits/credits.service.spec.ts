import { createHmac } from 'crypto';
import {
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library';
import { BadRequestException, ForbiddenException, Logger, ServiceUnavailableException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { CREDIT_PACKAGES } from '../common/constants/credits';
import { CardPayDto } from './credits.controller';
import { CreditsService } from './credits.service';
import {
  CARD_FULL_REFUND_RECOVERABLE_SQL,
  CARD_RECONCILE_GET_TIMEOUT_MS,
  advanceCardReconcileCursor,
  recoverableCardCredits,
  releaseCardReconcileLease,
  renewCardReconcileLease,
} from './card-refund.ledger';
import { AppleAppStorePaymentProvider } from './providers/apple-app-store.provider';
import { createTestAppleChain } from './providers/apple-storekit-test-jws';
import {
  CardPaymentProvider,
  CardReconcileRateLimitError,
  CardReconcileTransportError,
  cardOperationPurchaseId,
  cardOperationProviderTxId,
  cardRefundAction,
  cardTokenFingerprint,
} from './providers/card.provider';
import {
  SANDBOX_PARTIAL_ORDER_ID,
  SANDBOX_PARTIAL_REFUND_ID,
  sandboxPartialCardOrder,
} from './providers/card-refund.sandbox-fixture';
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
const COMBO_5 = CREDIT_PACKAGES.find((p) => p.key === 'combo_5')!;
const COMBO_10 = CREDIT_PACKAGES.find((p) => p.key === 'combo_10')!;

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
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
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
    $queryRaw: jest.fn(async () => []),
    $executeRaw: jest.fn(async () => 0),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
    fn(prisma),
  );
  prisma.venue.findUnique.mockResolvedValue(VENUE);
  return prisma;
}

describe('CreditsService billing', () => {
  const originalEnv = { ...process.env };
  const originalBundleId = process.env.APPLE_BUNDLE_ID;
  const originalAppAppleId = process.env.APPLE_APP_APPLE_ID;
  let prisma: ReturnType<typeof createPrisma>;
  let googleVerify: jest.Mock<Promise<VerifiedPayment>, [unknown]>;
  let payments: {
    storeProvider: jest.Mock;
    pixProvider: jest.Mock;
    cardProvider: jest.Mock;
  };
  let adminPush: { notifyPurchasePaid: jest.Mock };
  let service: CreditsService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.APPLE_SHARED_SECRET;
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    delete process.env.MERCADO_PAGO_SANDBOX;
    delete process.env.MERCADO_PAGO_PUBLIC_KEY;
    prisma = createPrisma();
    googleVerify = jest.fn();
    payments = {
      storeProvider: jest.fn().mockReturnValue({
        id: 'google_play',
        verify: googleVerify,
      }),
      pixProvider: jest.fn().mockReturnValue(new PixPaymentProvider()),
      cardProvider: jest.fn().mockReturnValue({
        id: 'card',
        isConfigured: false,
        publicKey: null,
        createCharge: jest.fn(),
        getOrder: jest.fn(),
      }),
    };
    adminPush = {
      notifyPurchasePaid: jest.fn().mockResolvedValue(undefined),
    };
    service = new CreditsService(
      prisma as never,
      payments as unknown as PaymentProviderRegistry,
      adminPush as never,
    );
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    if (originalEnv.APPLE_SHARED_SECRET === undefined) {
      delete process.env.APPLE_SHARED_SECRET;
    } else {
      process.env.APPLE_SHARED_SECRET = originalEnv.APPLE_SHARED_SECRET;
    }
    if (originalBundleId === undefined) delete process.env.APPLE_BUNDLE_ID;
    else process.env.APPLE_BUNDLE_ID = originalBundleId;
    if (originalAppAppleId === undefined) delete process.env.APPLE_APP_APPLE_ID;
    else process.env.APPLE_APP_APPLE_ID = originalAppAppleId;
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
    if (originalEnv.MERCADO_PAGO_PUBLIC_KEY === undefined) {
      delete process.env.MERCADO_PAGO_PUBLIC_KEY;
    } else {
      process.env.MERCADO_PAGO_PUBLIC_KEY = originalEnv.MERCADO_PAGO_PUBLIC_KEY;
    }
  });

  const storeDto = {
    packageKey: 'unit_1' as const,
    productId: 'after.credits.1',
    provider: 'google_play',
    purchaseId: 'gp-1',
    verificationData: 'token-abc',
  };

  it('catálogo oficial mantém IDs e cobra os preços PIX atuais', () => {
    expect(CREDIT_PACKAGES.map((p) => p.key)).toEqual([
      'unit_1',
      'combo_5',
      'combo_10',
    ]);
    expect(CREDIT_PACKAGES.map((p) => p.storeProductId)).toEqual([
      'after.credits.1',
      'after.credits.5',
      'after.credits.10',
    ]);
    expect(CREDIT_PACKAGES.map((p) => p.credits)).toEqual([1, 5, 10]);
    expect(UNIT.priceBrl).toBe(34.9);
    expect(COMBO_5.priceBrl).toBe(149.9);
    expect(COMBO_10.priceBrl).toBe(199.9);
    expect(service.packages()).toEqual(CREDIT_PACKAGES);
  });

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
    expect(adminPush.notifyPurchasePaid).toHaveBeenCalledTimes(1);
  });

  it('retry de store-confirm não gera segundo evento de push', async () => {
    googleVerify.mockResolvedValue({
      provider: 'google_play',
      productId: UNIT.storeProductId,
      externalId: 'order-retry',
    });
    const paid = {
      id: 'p-retry',
      venueId: VENUE.id,
      status: 'PAID',
      provider: 'google_play',
      packageKey: 'unit_1',
      credits: UNIT.credits,
      amountPaid: UNIT.priceBrl,
      confirmedAt: new Date(),
      providerTxId: 'google_play:order-retry',
    };
    prisma.creditPurchase.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue(paid);
    prisma.creditPurchase.create.mockResolvedValue(paid);
    prisma.creditWallet.upsert.mockResolvedValue({
      venueId: VENUE.id,
      balance: UNIT.credits,
    });

    await service.confirmStorePurchase(USER_ID, {
      ...storeDto,
      purchaseId: 'order-retry',
    });
    await service.confirmStorePurchase(USER_ID, {
      ...storeDto,
      purchaseId: 'order-retry',
    });
    expect(adminPush.notifyPurchasePaid).toHaveBeenCalledTimes(1);
    expect(prisma.creditPurchase.create).toHaveBeenCalledTimes(1);
  });

  it('falha do Firebase não desfaz pagamento da loja', async () => {
    adminPush.notifyPurchasePaid.mockRejectedValue(new Error('FCM down'));
    googleVerify.mockResolvedValue({
      provider: 'google_play',
      productId: UNIT.storeProductId,
      externalId: 'order-fcm',
    });
    const paid = {
      id: 'p-fcm',
      venueId: VENUE.id,
      status: 'PAID',
      provider: 'google_play',
      packageKey: 'unit_1',
      credits: UNIT.credits,
      amountPaid: UNIT.priceBrl,
      confirmedAt: new Date(),
      providerTxId: 'google_play:order-fcm',
    };
    prisma.creditPurchase.findUnique.mockResolvedValue(null);
    prisma.creditPurchase.create.mockResolvedValue(paid);
    prisma.creditWallet.upsert.mockResolvedValue({
      venueId: VENUE.id,
      balance: UNIT.credits,
    });

    await expect(
      service.confirmStorePurchase(USER_ID, {
        ...storeDto,
        purchaseId: 'order-fcm',
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PAID', id: 'p-fcm' }));
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
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

  it('não credita a mesma transação Apple duas vezes', async () => {
    process.env.APPLE_BUNDLE_ID = 'com.r2p.after.afterApp';
    delete process.env.APPLE_APP_APPLE_ID;
    const chain = createTestAppleChain();
    const transactionId = '2000000999';
    const signed = chain.sign({
      transactionId,
      originalTransactionId: transactionId,
    });
    payments.storeProvider.mockReturnValue(
      AppleAppStorePaymentProvider.forTests({
        rootCertificates: [chain.rootDer],
        enableOnlineChecks: false,
      }),
    );
    const paid = {
      id: 'p-apple',
      venueId: VENUE.id,
      status: 'PAID',
      provider: 'app_store',
      providerTxId: `app_store:${transactionId}`,
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
    const dto = {
      ...storeDto,
      provider: 'app_store',
      purchaseId: transactionId,
      verificationData: signed,
    };

    const first = await service.confirmStorePurchase(USER_ID, dto);
    const second = await service.confirmStorePurchase(USER_ID, dto);

    expect(first.id).toBe('p-apple');
    expect(second.id).toBe('p-apple');
    expect(prisma.creditPurchase.create).toHaveBeenCalledTimes(1);
    expect(prisma.creditPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerTxId: `app_store:${transactionId}`,
          credits: UNIT.credits,
        }),
      }),
    );
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
  });

  it('falha temporária da Apple não credita a wallet', async () => {
    process.env.APPLE_BUNDLE_ID = 'com.r2p.after.afterApp';
    const chain = createTestAppleChain();
    payments.storeProvider.mockReturnValue(
      AppleAppStorePaymentProvider.forTests({
        verifierFor: () => ({
          verifyAndDecodeTransaction: () => {
            throw new VerificationException(
              VerificationStatus.RETRYABLE_VERIFICATION_FAILURE,
            );
          },
        }),
      }),
    );

    await expect(
      service.confirmStorePurchase(USER_ID, {
        ...storeDto,
        provider: 'app_store',
        purchaseId: '2000000123',
        verificationData: chain.sign(),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
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

  it('fora do sandbox rejeita e-mail .local e @testuser.com sem criar compra', async () => {
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    const createCharge = jest.fn();
    payments.pixProvider.mockReturnValue({
      id: 'pix',
      isConfigured: true,
      createCharge,
    });

    prisma.venue.findUnique.mockResolvedValue({
      id: VENUE.id,
      ownerUserId: USER_ID,
      owner: { email: 'soseubar@after.local', name: 'Venue' },
    });
    await expect(
      service.createPixCharge(USER_ID, 'unit_1', 'soseubar@after.local'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
    expect(createCharge).not.toHaveBeenCalled();

    prisma.venue.findUnique.mockResolvedValue({
      id: VENUE.id,
      ownerUserId: USER_ID,
      owner: { email: 'test_user_br@testuser.com', name: 'Venue' },
    });
    await expect(service.createPixCharge(USER_ID, 'unit_1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
    expect(createCharge).not.toHaveBeenCalled();
  });

  it('normaliza espaços/caixa do e-mail do perfil e não usa @testuser.com', async () => {
    process.env.MERCADO_PAGO_SANDBOX = 'false';
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
    prisma.venue.findUnique.mockResolvedValue({
      id: VENUE.id,
      ownerUserId: USER_ID,
      owner: { email: '  Venue@After.COM  ', name: 'Venue Owner' },
    });
    prisma.creditPurchase.create.mockResolvedValue(
      pixPurchase({ status: 'PENDING' }),
    );
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({ status: 'PENDING' }),
    );

    await service.createPixCharge(USER_ID, 'unit_1', '  Venue@After.COM  ');
    expect(createCharge.mock.calls[0][0].payerEmail).toBe('venue@after.com');
    expect(createCharge.mock.calls[0][0].payerEmail).not.toContain('@testuser.com');
  });

  it('usa e-mail autenticado quando o e-mail do perfil do estabelecimento é inválido', async () => {
    process.env.MERCADO_PAGO_SANDBOX = 'false';
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
    prisma.venue.findUnique.mockResolvedValue({
      id: VENUE.id,
      ownerUserId: USER_ID,
      owner: { email: 'soseubar@after.local', name: 'Venue' },
    });
    prisma.creditPurchase.create.mockResolvedValue(
      pixPurchase({ status: 'PENDING' }),
    );
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({ status: 'PENDING' }),
    );

    await service.createPixCharge(USER_ID, 'unit_1', 'owner@venue.com');
    expect(createCharge.mock.calls[0][0].payerEmail).toBe('owner@venue.com');
    expect(prisma.creditPurchase.create).toHaveBeenCalled();
  });

  it('sandbox=true cria PIX mesmo com e-mail .local no perfil', async () => {
    process.env.NODE_ENV = 'test';
    process.env.MERCADO_PAGO_SANDBOX = 'true';
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
    prisma.venue.findUnique.mockResolvedValue({
      id: VENUE.id,
      ownerUserId: USER_ID,
      owner: { email: 'soseubar@after.local', name: 'Venue' },
    });
    prisma.creditPurchase.create.mockResolvedValue(
      pixPurchase({ status: 'PENDING' }),
    );
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({ status: 'PENDING' }),
    );

    await service.createPixCharge(USER_ID, 'unit_1', 'soseubar@after.local');
    expect(prisma.creditPurchase.create).toHaveBeenCalled();
    expect(createCharge).toHaveBeenCalled();
  });

  it('pix/create não envia pagador nem documento fiscal ao Mercado Pago', async () => {
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
    await service.createPixCharge(USER_ID, 'unit_1', undefined, {
      invoiceRequested: true,
      fiscalPersonType: 'CPF',
      fiscalName: 'João da Silva',
      fiscalDocument: '123.456.789-09',
      fiscalEmail: 'joao@exemplo.com',
    });
    const payload = createCharge.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ['amountBrl', 'idempotencyKey', 'packageKey', 'payerEmail', 'payerName', 'purchaseId'].sort(),
    );
    expect(payload.payerEmail).toBe('venue@test.com');
    expect(payload).not.toHaveProperty('fiscalDocument');
    expect(JSON.stringify(payload)).not.toContain('12345678909');
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
        amountBrl: UNIT.priceBrl,
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
          amountPaid: UNIT.priceBrl,
          credits: 1,
        }),
      }),
    );
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('combo_5 cobra 149.90 do catálogo, não um valor enviado pelo cliente', async () => {
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
      pixPurchase({
        packageKey: 'combo_5',
        amountPaid: COMBO_5.priceBrl,
        credits: 5,
      }),
    );
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({
        packageKey: 'combo_5',
        amountPaid: COMBO_5.priceBrl,
        credits: 5,
        providerTxId: 'pix:ORD01COMBO5',
      }),
    );

    const result = await service.createPixCharge(USER_ID, 'combo_5');
    expect(result.amount).toBe(COMBO_5.priceBrl);
    expect(result.amount).toBe(149.9);
    expect(createCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        amountBrl: COMBO_5.priceBrl,
        packageKey: 'combo_5',
      }),
    );
    expect(prisma.creditPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountPaid: COMBO_5.priceBrl,
          credits: 5,
          packageKey: 'combo_5',
        }),
      }),
    );
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('combo_10 cobra 199.90 do catálogo, não um valor enviado pelo cliente', async () => {
    const createCharge = jest.fn().mockResolvedValue({
      orderId: 'ORD01COMBO10',
      paymentId: 'PAY01COMBO10',
      qrCodeText: '00020126combo10',
      qrCodeImage: 'data:image/png;base64,combo10',
      expiresAt: null,
    });
    payments.pixProvider.mockReturnValue({
      id: 'pix',
      isConfigured: true,
      createCharge,
    });
    prisma.creditPurchase.create.mockResolvedValue(
      pixPurchase({
        packageKey: 'combo_10',
        amountPaid: COMBO_10.priceBrl,
        credits: 10,
      }),
    );
    prisma.creditPurchase.update.mockResolvedValue(
      pixPurchase({
        packageKey: 'combo_10',
        amountPaid: COMBO_10.priceBrl,
        credits: 10,
        providerTxId: 'pix:ORD01COMBO10',
      }),
    );

    const result = await service.createPixCharge(USER_ID, 'combo_10');
    expect(result.amount).toBe(COMBO_10.priceBrl);
    expect(result.amount).toBe(199.9);
    expect(createCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        amountBrl: COMBO_10.priceBrl,
        packageKey: 'combo_10',
      }),
    );
    expect(prisma.creditPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountPaid: COMBO_10.priceBrl,
          credits: 10,
          packageKey: 'combo_10',
        }),
      }),
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
        amountBrl: UNIT.priceBrl,
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
    expect(adminPush.notifyPurchasePaid).toHaveBeenCalledTimes(1);
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
    expect(result.amountPaid).toBe(UNIT.priceBrl);
    expect(result.currency).toBe('BRL');
    expect(result).not.toHaveProperty('providerTxId');
    expect(result).not.toHaveProperty('fiscalDocument');
    expect(result).not.toHaveProperty('fiscalName');
    expect(result).not.toHaveProperty('fiscalEmail');
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
    expect(adminPush.notifyPurchasePaid).toHaveBeenCalledTimes(1);
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

  function installPixRefundState(
    initial: 'PENDING' | 'PAID' | 'REFUNDED',
    balance = 1,
    purchase: { credits?: number; amountPaid?: number } = {},
  ) {
    let status: string = initial;
    let wallet = balance;
    const credits = purchase.credits ?? 1;
    const amountPaid = purchase.amountPaid ?? UNIT.priceBrl;
    prisma.creditPurchase.findUnique.mockImplementation(async () =>
      pixPurchase({
        status,
        credits,
        amountPaid,
        confirmedAt: status === 'PENDING' ? null : new Date(),
      }),
    );
    prisma.creditPurchase.updateMany.mockImplementation(async () => {
      if (status !== 'PAID') return { count: 0 };
      status = 'REFUNDED';
      return { count: 1 };
    });
    prisma.creditPurchase.update.mockImplementation(async ({
      data,
    }: {
      data: { status?: string };
    }) => {
      if (data.status) status = data.status;
      return pixPurchase({
        status,
        credits,
        amountPaid,
        confirmedAt: status === 'PENDING' ? null : new Date(),
      });
    });
    prisma.creditWallet.upsert.mockImplementation(async ({
      update,
    }: {
      update: { balance: { increment: number } };
    }) => {
      wallet += update.balance.increment;
      return { venueId: VENUE.id, balance: wallet };
    });
    return {
      status: () => status,
      wallet: () => wallet,
    };
  }

  function armPixRefund(order: Record<string, unknown>) {
    payments.pixProvider.mockReturnValue(
      mockConfiguredPix({
        extractOrderId: jest.fn().mockReturnValue(order.orderId),
        getOrder: jest.fn().mockResolvedValue(order),
      }),
    );
  }

  function fullPixRefund(overrides: Record<string, unknown> = {}) {
    return {
      ...paidOrder(),
      status: 'REFUNDED',
      refundProof: 'full',
      ...overrides,
    };
  }

  it('reembolso PIX integral de compra paga debita uma vez', async () => {
    const state = installPixRefundState('PAID', 1);
    armPixRefund(fullPixRefund());

    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });
    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(state.status()).toBe('REFUNDED');
    expect(state.wallet()).toBe(0);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledWith({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 0 },
      update: { balance: { increment: -1 } },
    });
  });

  it.each([
    ['valor incompatível', { amountBrl: 10 }],
    ['moeda divergente', { currency: 'USD' }],
    ['referência divergente', { externalReference: 'outra-compra' }],
    ['ordem divergente', { orderId: 'ORD-OUTRA' }],
    ['reembolso parcial', { refundProof: 'partial' }],
    ['sinal sem comprovação', { refundProof: 'unproven' }],
    ['valor ausente', { amountBrl: null }],
    ['referência ausente', { externalReference: null }],
    ['moeda ausente', { currency: null }],
  ])('reembolso PIX com %s não debita nem marca REFUNDED', async (_label, patch) => {
    const state = installPixRefundState('PAID', 3);
    armPixRefund(fullPixRefund(patch));

    await service.handlePixWebhook({ data: { id: String(patch.orderId ?? 'ORD01TESTPIX') } });

    expect(state.status()).toBe('PAID');
    expect(state.wallet()).toBe(3);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.updateMany).not.toHaveBeenCalled();
  });

  it('parciais PIX sucessivos não alteram a carteira e o integral posterior debita o pacote', async () => {
    const state = installPixRefundState('PAID', 5);
    armPixRefund(fullPixRefund({ refundProof: 'partial' }));

    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });
    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(state.status()).toBe('PAID');
    expect(state.wallet()).toBe(5);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();

    armPixRefund(fullPixRefund());
    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });
    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(state.status()).toBe('REFUNDED');
    expect(state.wallet()).toBe(4);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['saldo cobre o pacote', 5, 5, 0],
    ['saldo parcial', 3, 5, -2],
    ['saldo zerado', 0, 5, -5],
    ['saldo de outra compra', 12, 5, 7],
    ['saldo com cupom no mesmo pote', 4, 5, -1],
  ])(
    'PIX integral com %s debita os créditos da compra e pode ficar negativo',
    async (_label, balance, credits, expected) => {
      const state = installPixRefundState('PAID', balance, {
        credits,
        amountPaid: 149.9,
      });
      armPixRefund(fullPixRefund({ amountBrl: 149.9 }));

      await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });
      await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

      expect(state.status()).toBe('REFUNDED');
      expect(state.wallet()).toBe(expected);
      expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
    },
  );

  it('nova compra PIX soma créditos sobre saldo negativo', async () => {
    let status = 'PENDING';
    let wallet = -2;
    prisma.creditPurchase.findUnique.mockImplementation(async () =>
      pixPurchase({
        status,
        credits: 1,
        confirmedAt: status === 'PAID' ? new Date() : null,
      }),
    );
    prisma.creditPurchase.updateMany.mockImplementation(async () => {
      if (status !== 'PENDING') return { count: 0 };
      status = 'PAID';
      return { count: 1 };
    });
    prisma.creditWallet.upsert.mockImplementation(async ({
      update,
    }: {
      update: { balance: { increment: number } };
    }) => {
      wallet += update.balance.increment;
      return { venueId: VENUE.id, balance: wallet };
    });
    armPixRefund(paidOrder());

    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(status).toBe('PAID');
    expect(wallet).toBe(-1);
  });

  function provenPixPartial(
    amount = 10,
    refundId: string | null = 'REF-PIX-1',
    overrides: Record<string, unknown> = {},
  ) {
    return fullPixRefund({
      refundProof: 'partial',
      paymentMethodId: 'pix',
      paymentType: 'bank_transfer',
      provenPartialRefund: { refundedAmountBrl: amount, refundId },
      ...overrides,
    });
  }

  function installPixPartialAudits() {
    const rows: Array<Record<string, unknown>> = [];
    prisma.$executeRaw.mockImplementation(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = Array.from(strings).join(' ');
        if (!sql.includes('CreditRefundAudit') || !sql.includes('DO NOTHING')) return 0;
        const purchaseId = values[1];
        const kind = values[3];
        if (kind !== 'pix_partial_review') return 0;
        if (rows.some((row) => row.purchaseId === purchaseId && row.kind === kind)) return 0;
        rows.push({
          purchaseId,
          venueId: values[2],
          kind,
          originalAmount: values[6],
          refundedAmount: values[7],
          refundId: values[8],
        });
        return 1;
      },
    );
    return rows;
  }

  it('parcial PIX comprovado marca uma auditoria, mantém PAID e não mexe na carteira', async () => {
    const state = installPixRefundState('PAID', 5);
    const audits = installPixPartialAudits();
    armPixRefund(provenPixPartial());

    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });
    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(state.status()).toBe('PAID');
    expect(state.wallet()).toBe(5);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.updateMany).not.toHaveBeenCalled();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      kind: 'pix_partial_review',
      refundedAmount: 10,
      refundId: 'REF-PIX-1',
      originalAmount: UNIT.priceBrl,
    });
    expect(audits.some((row) => row.kind === 'partial_review' || row.kind === 'refund_review')).toBe(
      false,
    );
  });

  it.each([
    ['ordem divergente', { orderId: 'ORD-OUTRA' }],
    ['referência divergente', { externalReference: 'outra-compra' }],
    ['moeda divergente', { currency: 'USD' }],
    ['meio que não é PIX', { paymentMethodId: 'visa', paymentType: 'credit_card' }],
  ])('parcial PIX com %s não gera auditoria', async (_label, patch) => {
    const state = installPixRefundState('PAID', 5);
    const audits = installPixPartialAudits();
    armPixRefund(provenPixPartial(10, 'REF-PIX-1', patch));

    await service.handlePixWebhook({ data: { id: String(patch.orderId ?? 'ORD01TESTPIX') } });

    expect(state.status()).toBe('PAID');
    expect(state.wallet()).toBe(5);
    expect(audits).toHaveLength(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('parcial PIX sem linha de reembolso não gera auditoria', async () => {
    const state = installPixRefundState('PAID', 5);
    const audits = installPixPartialAudits();
    armPixRefund(
      fullPixRefund({
        refundProof: 'partial',
        paymentMethodId: 'pix',
        paymentType: 'bank_transfer',
        provenPartialRefund: null,
      }),
    );

    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(state.status()).toBe('PAID');
    expect(state.wallet()).toBe(5);
    expect(audits).toHaveLength(0);
  });

  it('segundo parcial da mesma compra não cria outro marcador nem troca o valor', async () => {
    const state = installPixRefundState('PAID', 5);
    const audits = installPixPartialAudits();
    armPixRefund(provenPixPartial(10, 'REF-PIX-1'));
    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    armPixRefund(provenPixPartial(20, 'REF-PIX-2'));
    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ refundedAmount: 10, refundId: 'REF-PIX-1' });
    expect(state.status()).toBe('PAID');
    expect(state.wallet()).toBe(5);
  });

  it('parcial PIX seguido de integral debita uma vez e a repetição não debita de novo', async () => {
    const state = installPixRefundState('PAID', 5);
    const audits = installPixPartialAudits();
    armPixRefund(provenPixPartial());
    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    armPixRefund(fullPixRefund());
    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });
    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(audits).toHaveLength(1);
    expect(state.status()).toBe('REFUNDED');
    expect(state.wallet()).toBe(4);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
  });

  it('reembolso PIX antes da confirmação não credita e marca a compra pendente', async () => {
    const state = installPixRefundState('PENDING', 0);
    armPixRefund(fullPixRefund());

    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(state.status()).toBe('REFUNDED');
    expect(state.wallet()).toBe(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REFUNDED' }),
      }),
    );
  });

  it('compra PIX já reembolsada não debita de novo', async () => {
    const state = installPixRefundState('REFUNDED', 0);
    armPixRefund(fullPixRefund());

    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(state.status()).toBe('REFUNDED');
    expect(state.wallet()).toBe(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.updateMany).not.toHaveBeenCalled();
  });

  it('PIX pago em moeda divergente não credita', async () => {
    const pix = mockConfiguredPix({
      extractOrderId: jest.fn().mockReturnValue('ORD01TESTPIX'),
      getOrder: jest.fn().mockResolvedValue({ ...paidOrder(), currency: 'USD' }),
    });
    payments.pixProvider.mockReturnValue(pix);
    prisma.creditPurchase.findUnique.mockResolvedValue(pixPurchase());

    await service.handlePixWebhook({ data: { id: 'ORD01TESTPIX' } });

    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.updateMany).not.toHaveBeenCalled();
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
    expect(payments.cardProvider).not.toHaveBeenCalled();

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
    expect(payments.cardProvider).not.toHaveBeenCalled();
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

  it('persiste snapshot fiscal no PIX e não altera o valor cobrado', async () => {
    const createCharge = jest.fn().mockResolvedValue({
      orderId: 'ORD01FISCAL',
      paymentId: 'PAY01FISCAL',
      qrCodeText: '00020126fiscal',
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

    const result = await service.createPixCharge(USER_ID, 'unit_1', undefined, {
      invoiceRequested: true,
      fiscalPersonType: 'CPF',
      fiscalName: '  João da Silva  ',
      fiscalDocument: '123.456.789-09',
      fiscalEmail: '  Email@Exemplo.COM  ',
    });

    expect(result.amount).toBe(UNIT.priceBrl);
    expect(result.status).toBe('PENDING');
    expect(prisma.creditPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceRequested: true,
          fiscalPersonType: 'CPF',
          fiscalName: 'João da Silva',
          fiscalDocument: '12345678909',
          fiscalEmail: 'email@exemplo.com',
          amountPaid: UNIT.priceBrl,
          status: 'PENDING',
        }),
      }),
    );
    expect(createCharge.mock.calls[0][0]).not.toHaveProperty('fiscalDocument');
  });

  it('recusa CPF inválido no PIX sem criar compra', async () => {
    await expect(
      service.createPixCharge(USER_ID, 'unit_1', undefined, {
        invoiceRequested: true,
        fiscalPersonType: 'CPF',
        fiscalName: 'João',
        fiscalDocument: '12345678900',
        fiscalEmail: 'a@b.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
  });

  it('persiste snapshot fiscal no store-confirm sem mudar idempotência', async () => {
    googleVerify.mockResolvedValue({
      provider: 'google_play',
      productId: UNIT.storeProductId,
      externalId: 'order-fiscal',
    });
    prisma.creditPurchase.findUnique.mockResolvedValue(null);
    prisma.creditPurchase.create.mockResolvedValue({
      id: 'p-fiscal',
      venueId: VENUE.id,
      status: 'PAID',
      providerTxId: 'google_play:order-fiscal',
      credits: UNIT.credits,
    });
    prisma.creditWallet.upsert.mockResolvedValue({
      venueId: VENUE.id,
      balance: UNIT.credits,
    });

    await service.confirmStorePurchase(USER_ID, {
      ...storeDto,
      invoiceRequested: true,
      fiscalPersonType: 'CNPJ',
      fiscalName: 'Empresa LTDA',
      fiscalDocument: '11.444.777/0001-61',
      fiscalEmail: 'fiscal@empresa.com',
    });

    expect(googleVerify).toHaveBeenCalled();
    expect(prisma.creditPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceRequested: true,
          fiscalPersonType: 'CNPJ',
          fiscalName: 'Empresa LTDA',
          fiscalDocument: '11444777000161',
          fiscalEmail: 'fiscal@empresa.com',
          status: 'PAID',
        }),
      }),
    );
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
  });

  it('store-confirm com provider card não credita', async () => {
    await expect(
      service.confirmStorePurchase(USER_ID, {
        ...storeDto,
        provider: 'card',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(payments.storeProvider).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
  });

  const cardKey = 'card-op-1234567890ab';
  const cardToken = '519ada5ac7431ef6ce24ac19c38f6768';
  const otherCardToken = 'abcdef0123456789abcdef0123456789';

  function cardInput(overrides: Record<string, unknown> = {}) {
    return {
      packageKey: 'unit_1',
      token: cardToken,
      paymentMethodId: 'visa',
      paymentType: 'credit_card',
      installments: 1,
      idempotencyKey: cardKey,
      ...overrides,
    };
  }

  function cardOrder(purchaseId: string, overrides: Record<string, unknown> = {}) {
    const order = {
      orderId: 'ORD01CARD',
      paymentId: 'PAY01CARD',
      status: 'PAID',
      amountBrl: UNIT.priceBrl,
      currency: 'BRL',
      externalReference: purchaseId,
      installments: 1,
      paymentType: 'credit_card',
      paymentMethodId: 'visa',
      ...overrides,
    };
    if (order.refundScope === 'full' && !Object.prototype.hasOwnProperty.call(overrides, 'refundedAmountBrl')) {
      return { ...order, refundedAmountBrl: order.amountBrl };
    }
    return order;
  }

  function useCard(createCharge = jest.fn(), getOrder = jest.fn()) {
    payments.cardProvider.mockReturnValue({
      id: 'card',
      isConfigured: true,
      publicKey: 'TEST-public-key',
      createCharge,
      getOrder,
    });
    return { createCharge, getOrder };
  }

  it('config do cartão expõe só a public key e uma parcela', () => {
    payments.cardProvider.mockReturnValue({
      id: 'card',
      isConfigured: true,
      publicKey: 'TEST-public-key',
      createCharge: jest.fn(),
      getOrder: jest.fn(),
    });
    const config = service.cardCheckoutConfig();
    expect(config).toEqual({
      publicKey: 'TEST-public-key',
      maxInstallments: 1,
    });
    expect(JSON.stringify(config)).not.toContain('APP_USR');
    expect(JSON.stringify(config)).not.toContain('MERCADO_PAGO_ACCESS_TOKEN');
    expect(config).not.toHaveProperty('accessToken');
  });

  it('config recusa devolver o Access Token no lugar da public key', () => {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-same-secret';
    payments.cardProvider.mockReturnValue({
      id: 'card',
      isConfigured: true,
      publicKey: 'APP_USR-same-secret',
      createCharge: jest.fn(),
      getOrder: jest.fn(),
    });
    expect(() => service.cardCheckoutConfig()).toThrow(ServiceUnavailableException);
  });

  it('config sem public key não credita e não inventa chave', () => {
    expect(() => service.cardCheckoutConfig()).toThrow(ServiceUnavailableException);
  });

  it('produção recusa Public Key TEST- no cartão', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-live-token';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'TEST-public-key';
    const createCharge = jest.fn();
    payments.cardProvider.mockReturnValue({
      id: 'card',
      isConfigured: true,
      publicKey: 'TEST-public-key',
      createCharge,
      getOrder: jest.fn(),
    });
    expect(() => service.cardCheckoutConfig()).toThrow(ServiceUnavailableException);
    await expect(service.payCard(USER_ID, cardInput())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(createCharge).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
  });

  it('sandbox aceita Public Key APP_USR junto de Access Token de teste', () => {
    process.env.NODE_ENV = 'test';
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-access-token';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-live-public';
    payments.cardProvider.mockReturnValue({
      id: 'card',
      isConfigured: true,
      publicKey: 'APP_USR-live-public',
      createCharge: jest.fn(),
      getOrder: jest.fn(),
    });
    expect(service.cardCheckoutConfig()).toEqual({
      publicKey: 'APP_USR-live-public',
      maxInstallments: 1,
    });
  });

  it('produção com credencial de teste não cria PIX nem cartão', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-access-token';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'TEST-public-key';
    const pixCharge = jest.fn();
    payments.pixProvider.mockReturnValue({
      id: 'pix',
      isConfigured: true,
      createCharge: pixCharge,
    });
    const cardCharge = jest.fn();
    useCard(cardCharge);

    await expect(
      service.createPixCharge(USER_ID, 'unit_1', 'venue@after.com'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.payCard(USER_ID, cardInput())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(pixCharge).not.toHaveBeenCalled();
    expect(cardCharge).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
  });

  it('produção com credenciais APP_USR coerentes ainda cobra no cartão', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MERCADO_PAGO_SANDBOX = 'false';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-live-token';
    process.env.MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-live-public';
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    installCardMemory(prisma);
    const createCharge = jest.fn().mockResolvedValue({
      kind: 'order',
      order: cardOrder(purchaseId),
    });
    useCard(createCharge);

    const paid = await service.payCard(USER_ID, cardInput());
    expect(paid.status).toBe('PAID');
    expect(createCharge).toHaveBeenCalledTimes(1);
  });

  it('rejeita PAN, débito, parcela e pacote inválido sem chamar o provedor', async () => {
    const createCharge = jest.fn();
    useCard(createCharge);
    await expect(
      service.payCard(USER_ID, cardInput({ token: '4242424242424242' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.payCard(USER_ID, cardInput({ token: '12345678901234567890' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.payCard(USER_ID, cardInput({ paymentType: 'debit_card' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.payCard(USER_ID, cardInput({ installments: 3 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.payCard(USER_ID, cardInput({ packageKey: 'combo_99' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createCharge).not.toHaveBeenCalled();
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('DTO recusa número do cartão, CVV e parcela acima de 1', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const valid = cardInput();
    await expect(
      pipe.transform(
        { ...valid, cardNumber: '4242424242424242', cvv: '123' },
        { type: 'body', metatype: CardPayDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { ...valid, installments: 6 },
        { type: 'body', metatype: CardPayDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cartão aprovado credita o catálogo uma vez e o replay não cobra de novo', async () => {
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    const memory = installCardMemory(prisma);
    const createCharge = jest.fn().mockResolvedValue({
      kind: 'order',
      order: cardOrder(purchaseId),
    });
    const getOrder = jest.fn();
    useCard(createCharge, getOrder);

    const paid = await service.payCard(USER_ID, cardInput());
    const replay = await service.payCard(USER_ID, cardInput());

    expect(paid).toEqual(
      expect.objectContaining({
        purchaseId,
        status: 'PAID',
        provider: 'card',
        amount: UNIT.priceBrl,
        currency: 'BRL',
        credits: 1,
        orderId: 'ORD01CARD',
        outcome: 'approved',
        idempotencyKey: cardKey,
      }),
    );
    expect(JSON.stringify(paid)).not.toContain(cardToken);
    expect(paid).not.toHaveProperty('token');
    expect(paid).not.toHaveProperty('providerTxId');
    expect(replay.outcome).toBe('approved');
    expect(createCharge).toHaveBeenCalledTimes(1);
    expect(createCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseId,
        packageKey: 'unit_1',
        amountBrl: UNIT.priceBrl,
        installments: 1,
        paymentType: 'credit_card',
        paymentMethodId: 'visa',
        idempotencyKey: `card-order:${purchaseId}`,
      }),
    );
    expect(getOrder).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledWith({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
    expect(memory.balance()).toBe(1);
    expect(adminPush.notifyPurchasePaid).toHaveBeenCalledTimes(1);
    expect(prisma.creditPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'card',
          productId: null,
          amountPaid: UNIT.priceBrl,
          credits: 1,
          currency: 'BRL',
          providerTxId: cardOperationProviderTxId(
            purchaseId,
            cardTokenFingerprint(cardToken),
          ),
        }),
      }),
    );
  });

  it('combo de 10 créditos usa o preço do catálogo', async () => {
    const key = 'card-op-combo10-0001';
    const purchaseId = cardOperationPurchaseId(VENUE.id, key);
    const memory = installCardMemory(prisma);
    const createCharge = jest.fn().mockImplementation(async (input: { purchaseId: string }) => ({
      kind: 'order',
      order: cardOrder(input.purchaseId, {
        amountBrl: COMBO_10.priceBrl,
      }),
    }));
    useCard(createCharge);

    const paid = await service.payCard(
      USER_ID,
      cardInput({ packageKey: 'combo_10', idempotencyKey: key }),
    );

    expect(paid.credits).toBe(10);
    expect(paid.amount).toBe(199.9);
    expect(createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amountBrl: 199.9, packageKey: 'combo_10' }),
    );
    expect(memory.balance()).toBe(10);
  });

  it('cartão recusado ou pendente não credita', async () => {
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    const memory = installCardMemory(prisma);
    const createCharge = jest.fn().mockResolvedValue({
      kind: 'order',
      order: cardOrder(purchaseId, { status: 'FAILED' }),
    });
    useCard(createCharge);

    const rejected = await service.payCard(USER_ID, cardInput());
    expect(rejected.outcome).toBe('rejected');
    expect(rejected.status).toBe('FAILED');
    expect(memory.balance()).toBe(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();

    createCharge.mockClear();
    const again = await service.payCard(USER_ID, cardInput());
    expect(again.outcome).toBe('rejected');
    expect(createCharge).not.toHaveBeenCalled();
  });

  it('HTTP 402 com order confirmada como recusa não credita', async () => {
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    const memory = installCardMemory(prisma);
    const createCharge = jest.fn().mockResolvedValue({
      kind: 'order',
      confirmWithGet: true,
      order: cardOrder(purchaseId, { status: 'FAILED', orderId: 'ORD402CARD' }),
    });
    const getOrder = jest.fn().mockResolvedValue(
      cardOrder(purchaseId, { status: 'FAILED', orderId: 'ORD402CARD' }),
    );
    useCard(createCharge, getOrder);

    const rejected = await service.payCard(USER_ID, cardInput());
    expect(rejected.outcome).toBe('rejected');
    expect(rejected.status).toBe('FAILED');
    expect(rejected.orderId).toBe('ORD402CARD');
    expect(getOrder).toHaveBeenCalledWith('ORD402CARD');
    expect(memory.balance()).toBe(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();

    const again = await service.payCard(USER_ID, cardInput());
    expect(again.outcome).toBe('rejected');
    expect(createCharge).toHaveBeenCalledTimes(1);
  });

  it('HTTP 402 ambíguo permanece pendente sem order e sem crédito', async () => {
    const memory = installCardMemory(prisma);
    const createCharge = jest.fn().mockResolvedValue({ kind: 'unknown' });
    const getOrder = jest.fn();
    useCard(createCharge, getOrder);

    const unknown = await service.payCard(USER_ID, cardInput());
    expect(unknown.outcome).toBe('unknown');
    expect(unknown.status).toBe('PENDING');
    expect(unknown.orderId).toBeNull();
    expect(getOrder).not.toHaveBeenCalled();
    expect(memory.balance()).toBe(0);
  });

  it('order pendente guarda o id e não credita', async () => {
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    const memory = installCardMemory(prisma);
    const createCharge = jest.fn().mockResolvedValue({
      kind: 'order',
      order: cardOrder(purchaseId, { status: 'PENDING' }),
    });
    const getOrder = jest.fn();
    useCard(createCharge, getOrder);

    const pending = await service.payCard(USER_ID, cardInput());
    expect(pending.outcome).toBe('pending');
    expect(pending.status).toBe('PENDING');
    expect(pending.orderId).toBe('ORD01CARD');
    expect(memory.balance()).toBe(0);

    getOrder.mockResolvedValue(cardOrder(purchaseId, { status: 'PENDING' }));
    await service.payCard(USER_ID, cardInput());
    expect(createCharge).toHaveBeenCalledTimes(1);
    expect(getOrder).toHaveBeenCalledWith('ORD01CARD');
    expect(memory.balance()).toBe(0);
  });

  it('falha ao consultar a order não abre outra cobrança', async () => {
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    installCardMemory(prisma);
    const createCharge = jest.fn().mockResolvedValue({
      kind: 'order',
      order: cardOrder(purchaseId, { status: 'PENDING' }),
    });
    const getOrder = jest.fn().mockRejectedValue(new Error('timeout'));
    useCard(createCharge, getOrder);

    await service.payCard(USER_ID, cardInput());
    const again = await service.payCard(USER_ID, cardInput());

    expect(again.outcome).toBe('pending');
    expect(again.status).toBe('PENDING');
    expect(again.orderId).toBe('ORD01CARD');
    expect(createCharge).toHaveBeenCalledTimes(1);
    expect(getOrder).toHaveBeenCalledTimes(1);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('timeout e resposta desconhecida reutilizam a mesma operação', async () => {
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    const memory = installCardMemory(prisma);
    const createCharge = jest
      .fn()
      .mockRejectedValueOnce(new Error(`socket timeout ${cardToken}`))
      .mockResolvedValueOnce({ kind: 'unknown' })
      .mockResolvedValueOnce({
        kind: 'order',
        order: cardOrder(purchaseId),
      });
    useCard(createCharge);
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const timedOut = await service.payCard(USER_ID, cardInput());
    const unknown = await service.payCard(USER_ID, cardInput());
    const paid = await service.payCard(USER_ID, cardInput());

    expect(timedOut.outcome).toBe('unknown');
    expect(timedOut.status).toBe('PENDING');
    expect(unknown.outcome).toBe('unknown');
    expect(paid.outcome).toBe('approved');
    expect(createCharge).toHaveBeenCalledTimes(3);
    const keys = createCharge.mock.calls.map(
      (call) => (call[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(new Set(keys)).toEqual(new Set([`card-order:${purchaseId}`]));
    expect(prisma.creditPurchase.create).toHaveBeenCalledTimes(1);
    expect(memory.balance()).toBe(1);
    expect(logged.mock.calls.flat().join(' ')).not.toContain(cardToken);
    logged.mockRestore();
  });

  it('requisições simultâneas compartilham uma cobrança e um crédito', async () => {
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    const memory = installCardMemory(prisma);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const createCharge = jest.fn().mockImplementation(async () => {
      await gate;
      return { kind: 'order', order: cardOrder(purchaseId) };
    });
    useCard(createCharge);

    const first = service.payCard(USER_ID, cardInput());
    const second = service.payCard(USER_ID, cardInput());
    for (let i = 0; i < 20 && createCharge.mock.calls.length < 1; i += 1) {
      await Promise.resolve();
    }
    expect(createCharge).toHaveBeenCalledTimes(1);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(a.status).toBe('PAID');
    expect(b.status).toBe('PAID');
    expect(a.purchaseId).toBe(b.purchaseId);
    expect(memory.balance()).toBe(1);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
  });

  it('outro token na mesma operação não gera nova cobrança', async () => {
    const memory = installCardMemory(prisma);
    const createCharge = jest.fn().mockResolvedValue({ kind: 'unknown' });
    useCard(createCharge);

    await service.payCard(USER_ID, cardInput());
    await expect(
      service.payCard(USER_ID, cardInput({ token: otherCardToken })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(createCharge).toHaveBeenCalledTimes(1);
    expect(memory.balance()).toBe(0);
    expect(prisma.creditPurchase.create).toHaveBeenCalledTimes(1);
  });

  it('duas operações distintas podem creditar dois pacotes', async () => {
    const memory = installCardMemory(prisma);
    const createCharge = jest.fn().mockImplementation(async (input: { purchaseId: string }) => ({
      kind: 'order',
      order: cardOrder(input.purchaseId, {
        orderId: `ORD${input.purchaseId.slice(2, 14)}`,
      }),
    }));
    useCard(createCharge);

    await service.payCard(USER_ID, cardInput());
    await service.payCard(
      USER_ID,
      cardInput({ idempotencyKey: 'card-op-second-00001' }),
    );

    expect(createCharge).toHaveBeenCalledTimes(2);
    expect(memory.balance()).toBe(2);
  });

  it('valor, moeda, referência, parcela ou tipo divergentes não creditam', async () => {
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    const cases = [
      { amountBrl: 1 },
      { currency: 'USD' },
      { externalReference: 'outra-compra' },
      { installments: 12 },
      { paymentType: 'debit_card' },
    ];
    for (const patch of cases) {
      const memory = installCardMemory(prisma);
      const createCharge = jest.fn().mockResolvedValue({
        kind: 'order',
        order: cardOrder(purchaseId, { status: 'PAID', ...patch }),
      });
      useCard(createCharge);
      const result = await service.payCard(USER_ID, cardInput());
      expect(result.status).toBe('PENDING');
      expect(result.outcome).toBe('pending');
      expect(memory.balance()).toBe(0);
      expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    }
  });

  it('estorno antes do crédito não mexe na carteira', async () => {
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    const memory = installCardMemory(prisma);
    useCard(
      jest.fn().mockResolvedValue({
        kind: 'order',
        order: cardOrder(purchaseId, { status: 'REFUNDED' }),
      }),
    );

    const result = await service.payCard(USER_ID, cardInput());
    expect(result.status).toBe('PENDING');
    expect(result.outcome).toBe('pending');
    expect(memory.balance()).toBe(0);
    expect(memory.audits).toHaveLength(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('cartão sem configuração, sandbox em produção ou e-mail inválido não cria compra', async () => {
    await expect(service.payCard(USER_ID, cardInput())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    useCard();
    process.env.NODE_ENV = 'production';
    process.env.MERCADO_PAGO_SANDBOX = 'true';
    await expect(service.payCard(USER_ID, cardInput())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    process.env.NODE_ENV = 'test';
    delete process.env.MERCADO_PAGO_SANDBOX;
    prisma.venue.findUnique.mockResolvedValueOnce({
      ...VENUE,
      owner: { email: 'owner@after.local', name: 'Owner' },
    });
    await expect(service.payCard(USER_ID, cardInput())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.creditPurchase.create).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  function seedCardRow(
    memory: ReturnType<typeof installCardMemory>,
    overrides: Record<string, unknown> = {},
  ) {
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    const row = {
      id: purchaseId,
      venueId: VENUE.id,
      provider: 'card',
      providerTxId: `card:ORD01CARD`,
      status: 'PENDING',
      amountPaid: UNIT.priceBrl,
      credits: UNIT.credits,
      currency: 'BRL',
      packageKey: 'unit_1',
      ...overrides,
      id: purchaseId,
    };
    memory.rows.set(purchaseId, row);
    return row;
  }

  function armCardWebhook(
    purchaseId: string,
    orderOverrides: Record<string, unknown> = {},
  ) {
    const pix = mockConfiguredPix({
      extractOrderId: jest.fn().mockReturnValue('ORD01CARD'),
      getOrder: jest.fn().mockResolvedValue({
        orderId: 'ORD01CARD',
        paymentId: 'PAY01CARD',
        status: 'PAID',
        amountBrl: UNIT.priceBrl,
        currency: 'BRL',
        externalReference: purchaseId,
        expiresAt: null,
      }),
    });
    payments.pixProvider.mockReturnValue(pix);
    const createCharge = jest.fn();
    const getOrder = jest.fn().mockResolvedValue(
      cardOrder(purchaseId, orderOverrides),
    );
    payments.cardProvider.mockReturnValue({
      id: 'card',
      isConfigured: true,
      publicKey: 'TEST-public-key',
      createCharge,
      getOrder,
    });
    return { createCharge, getOrder };
  }

  it('GET do cartão aprovado credita uma vez e não cria cobrança', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory);
    const createCharge = jest.fn();
    const getOrder = jest.fn().mockResolvedValue(cardOrder(row.id as string));
    useCard(createCharge, getOrder);

    const result = await service.purchaseById(USER_ID, row.id as string);

    expect(result.status).toBe('PAID');
    expect(result.provider).toBe('card');
    expect(memory.balance()).toBe(1);
    expect(createCharge).not.toHaveBeenCalled();
    expect(getOrder).toHaveBeenCalledWith('ORD01CARD');
  });

  it('GET do cartão recusado, pendente ou 3DS não credita', async () => {
    for (const status of ['FAILED', 'CANCELLED', 'PENDING']) {
      const memory = installCardMemory(prisma);
      const row = seedCardRow(memory);
      const createCharge = jest.fn();
      useCard(
        createCharge,
        jest.fn().mockResolvedValue(cardOrder(row.id as string, { status })),
      );
      const result = await service.purchaseById(USER_ID, row.id as string);
      expect(result.status).toBe(status);
      expect(memory.balance()).toBe(0);
      expect(createCharge).not.toHaveBeenCalled();
    }
  });

  it('timeout sem order id e falha do Mercado Pago deixam o cartão pendente', async () => {
    const memory = installCardMemory(prisma);
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    const row = seedCardRow(memory, {
      providerTxId: cardOperationProviderTxId(
        purchaseId,
        cardTokenFingerprint(cardToken),
      ),
    });
    const createCharge = jest.fn();
    const getOrder = jest.fn();
    useCard(createCharge, getOrder);

    const pending = await service.purchaseById(USER_ID, row.id as string);
    expect(pending.status).toBe('PENDING');
    expect(getOrder).not.toHaveBeenCalled();
    expect(createCharge).not.toHaveBeenCalled();

    memory.rows.set(purchaseId, { ...row, providerTxId: 'card:ORD01CARD' });
    getOrder.mockRejectedValue(new ServiceUnavailableException('timeout'));
    const again = await service.purchaseById(USER_ID, purchaseId);
    expect(again.status).toBe('PENDING');
    expect(memory.balance()).toBe(0);
    expect(createCharge).not.toHaveBeenCalled();
  });

  it('webhook associa order tardia depois do timeout e credita uma vez', async () => {
    const memory = installCardMemory(prisma);
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    seedCardRow(memory, {
      providerTxId: cardOperationProviderTxId(
        purchaseId,
        cardTokenFingerprint(cardToken),
      ),
    });
    const { createCharge } = armCardWebhook(purchaseId);

    const first = await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    const second = await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(first).toEqual(expect.objectContaining({ status: 'PAID', provider: 'card' }));
    expect(second).toEqual(expect.objectContaining({ status: 'PAID' }));
    expect(memory.balance()).toBe(1);
    expect(createCharge).not.toHaveBeenCalled();
    expect(memory.rows.get(purchaseId)?.providerTxId).toBe('card:ORD01CARD');
  });

  it('webhook e GET simultâneos não duplicam crédito do cartão', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory);
    armCardWebhook(row.id as string);

    await Promise.all([
      service.handlePixWebhook({ data: { id: 'ORD01CARD' } }),
      service.purchaseById(USER_ID, row.id as string),
    ]);

    expect(memory.balance()).toBe(1);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
  });

  it('duas confirmações simultâneas do mesmo cartão creditam uma vez', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory);
    useCard(
      jest.fn(),
      jest.fn().mockResolvedValue(cardOrder(row.id as string)),
    );

    const [a, b] = await Promise.all([
      service.purchaseById(USER_ID, row.id as string),
      service.purchaseById(USER_ID, row.id as string),
    ]);

    expect(a.status).toBe('PAID');
    expect(b.status).toBe('PAID');
    expect(memory.balance()).toBe(1);
  });

  it('divergência de valor ou moeda no webhook não credita o cartão', async () => {
    for (const patch of [{ amountBrl: 1 }, { currency: 'USD' }]) {
      const memory = installCardMemory(prisma);
      const row = seedCardRow(memory);
      armCardWebhook(row.id as string, { status: 'PAID', ...patch });
      const result = await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
      expect(result).toEqual(expect.objectContaining({ status: 'PENDING' }));
      expect(memory.balance()).toBe(0);
    }
  });

  it('falha ao consultar a order no webhook não aprova o cartão', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory);
    const armed = armCardWebhook(row.id as string);
    armed.getOrder.mockRejectedValue(new ServiceUnavailableException('down'));

    await expect(
      service.handlePixWebhook({ data: { id: 'ORD01CARD' } }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(memory.balance()).toBe(0);
    expect(memory.rows.get(row.id as string)?.status).toBe('PENDING');
    expect(armed.createCharge).not.toHaveBeenCalled();
  });

  it('estorno total e chargeback descontam uma vez; repetição não desconta de novo', async () => {
    for (const patch of [
      { status: 'REFUNDED', refundScope: 'full' },
      { status: 'REFUNDED', refundScope: 'full', paymentType: 'credit_card' },
    ]) {
      const memory = installCardMemory(prisma);
      const row = seedCardRow(memory, { status: 'PAID', confirmedAt: new Date() });
      armCardWebhook(row.id as string, patch);
      prisma.creditWallet.upsert.mockClear();

      const first = await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
      const second = await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

      expect(first).toEqual(expect.objectContaining({ status: 'REFUNDED' }));
      expect(second).toEqual(expect.objectContaining({ status: 'REFUNDED' }));
      expect(memory.balance()).toBe(0);
      expect(memory.audits).toHaveLength(1);
      expect(memory.audits[0]).toEqual(
        expect.objectContaining({
          kind: 'shortfall',
          creditsRecovered: 0,
          creditsUnrecovered: UNIT.credits,
        }),
      );
      expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    }
  });

  it('estorno integral de cartão não passa de zero e registra o que faltou', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(),
      credits: 5,
      amountPaid: 149.9,
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 3 },
      update: { balance: { increment: 3 } },
    });
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'full',
      amountBrl: 149.9,
      refundedAmountBrl: 149.9,
    });

    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(memory.rows.get(row.id as string)?.status).toBe('REFUNDED');
    expect(memory.balance()).toBe(0);
    expect(memory.audits).toEqual([
      expect.objectContaining({
        kind: 'shortfall',
        creditsRecovered: 3,
        creditsUnrecovered: 2,
      }),
    ]);
  });

  it.each([
    [10, 5, 5, 5, 0],
    [5, 5, 0, 5, 0],
    [3, 5, 0, 3, 2],
    [0, 5, 0, 0, 5],
    [-2, 5, -2, 0, 5],
    [-5, 10, -5, 0, 10],
  ])(
    'estorno integral de cartão saldo %s pacote %s termina em %s',
    async (opening, credits, expected, recovered, shortfall) => {
      const memory = installCardMemory(prisma);
      const amountPaid = credits === 10 ? 199.9 : 149.9;
      const row = seedCardRow(memory, {
        status: 'PAID',
        confirmedAt: new Date(),
        credits,
        amountPaid,
      });
      await prisma.creditWallet.upsert({
        where: { venueId: VENUE.id },
        create: { venueId: VENUE.id, balance: opening },
        update: { balance: { increment: opening } },
      });
      prisma.creditWallet.upsert.mockClear();
      armCardWebhook(row.id as string, {
        status: 'REFUNDED',
        refundScope: 'full',
        amountBrl: amountPaid,
        refundedAmountBrl: amountPaid,
      });

      await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
      await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

      expect(memory.rows.get(row.id as string)?.status).toBe('REFUNDED');
      expect(memory.balance()).toBe(expected);
      expect(memory.clawbackSql()).toContain(CARD_FULL_REFUND_RECOVERABLE_SQL);
      expect(memory.clawbackSql()).not.toContain('LEAST(w.balance,');
      expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
      if (shortfall === 0) {
        expect(memory.audits).toEqual([]);
      } else {
        expect(memory.audits).toEqual([
          expect.objectContaining({
            kind: 'shortfall',
            creditsRecovered: recovered,
            creditsUnrecovered: shortfall,
          }),
        ]);
      }
    },
  );

  it('estorno de cartão após débito PIX que deixou saldo negativo não cria crédito', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(),
      credits: 5,
      amountPaid: 149.9,
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 5 },
      update: { balance: { increment: 5 } },
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 0 },
      update: { balance: { increment: -7 } },
    });
    expect(memory.balance()).toBe(-2);
    prisma.creditWallet.upsert.mockClear();
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'full',
      amountBrl: 149.9,
      refundedAmountBrl: 149.9,
    });

    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(memory.rows.get(row.id as string)?.status).toBe('REFUNDED');
    expect(memory.balance()).toBe(-2);
    expect(memory.audits).toEqual([
      expect.objectContaining({
        kind: 'shortfall',
        creditsRecovered: 0,
        creditsUnrecovered: 5,
      }),
    ]);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('estorno antes da confirmação não gera crédito nem débito', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory);
    armCardWebhook(row.id as string, { status: 'REFUNDED', refundScope: 'full' });

    const result = await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(result).toEqual(expect.objectContaining({ status: 'REFUNDED' }));
    expect(memory.balance()).toBe(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('estorno parcial de cartão preserva o saldo e o status PAID', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory, { status: 'PAID', confirmedAt: new Date() });
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'partial',
      refundedAmountBrl: 10,
    });
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const result = await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(result).toEqual(expect.objectContaining({ status: 'PAID', provider: 'card' }));
    expect(memory.balance()).toBe(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(logged.mock.calls.flat().join(' ')).toContain(
      `Card partial refund requires manual review for purchase ${row.id}`,
    );
    logged.mockRestore();
  });

  async function seedPaidCardBalance(balance: number) {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(),
    });
    if (balance !== 0) {
      await prisma.creditWallet.upsert({
        where: { venueId: VENUE.id },
        create: { venueId: VENUE.id, balance },
        update: { balance: { increment: balance } },
      });
    }
    prisma.creditWallet.upsert.mockClear();
    adminPush.notifyPurchasePaid.mockClear();
    return { memory, row };
  }

  it('estorno total de compra aprovada devolve o crédito uma vez', async () => {
    const { memory, row } = await seedPaidCardBalance(UNIT.credits);
    const armed = armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'full',
    });

    const result = await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'REFUNDED',
        provider: 'card',
        credits: UNIT.credits,
      }),
    );
    expect(memory.rows.get(row.id as string)?.status).toBe('REFUNDED');
    expect(memory.balance()).toBe(0);
    expect(memory.audits).toHaveLength(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(armed.createCharge).not.toHaveBeenCalled();
    expect(adminPush.notifyPurchasePaid).not.toHaveBeenCalled();
  });

  it('webhook de estorno duplicado não desconta de novo', async () => {
    const { memory, row } = await seedPaidCardBalance(UNIT.credits);
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'full',
    });

    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(memory.rows.get(row.id as string)?.status).toBe('REFUNDED');
    expect(memory.balance()).toBe(0);
    expect(memory.audits).toHaveLength(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('webhook de estorno e consulta simultâneos descontam uma vez', async () => {
    const { memory, row } = await seedPaidCardBalance(UNIT.credits);
    const armed = armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'full',
    });

    await Promise.all([
      service.handlePixWebhook({ data: { id: 'ORD01CARD' } }),
      service.purchaseById(USER_ID, row.id as string),
    ]);

    expect(memory.rows.get(row.id as string)?.status).toBe('REFUNDED');
    expect(memory.balance()).toBe(0);
    expect(memory.audits).toHaveLength(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(armed.createCharge).not.toHaveBeenCalled();
  });

  it('chargeback confirmado desconta o crédito uma vez', async () => {
    const { memory, row } = await seedPaidCardBalance(UNIT.credits);
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'full',
    });

    const result = await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(result).toEqual(expect.objectContaining({ status: 'REFUNDED' }));
    expect(memory.balance()).toBe(0);
    expect(memory.audits).toHaveLength(0);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(adminPush.notifyPurchasePaid).not.toHaveBeenCalled();
  });

  it('consulta local de compra paga não aplica estorno sem webhook', async () => {
    const { memory, row } = await seedPaidCardBalance(UNIT.credits);
    const getOrder = jest.fn().mockResolvedValue(
      cardOrder(row.id as string, { status: 'REFUNDED', refundScope: 'full' }),
    );
    useCard(jest.fn(), getOrder);

    const result = await service.purchaseById(USER_ID, row.id as string);

    expect(result.status).toBe('PAID');
    expect(getOrder).not.toHaveBeenCalled();
    expect(memory.balance()).toBe(UNIT.credits);
    expect(memory.rows.get(row.id as string)?.status).toBe('PAID');
  });

  it('estorno total com saldo zero registra a diferença e não fica negativo', async () => {
    const { memory, row } = await seedPaidCardBalance(0);
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 0 },
      update: { balance: { increment: 0 } },
    });
    prisma.creditWallet.upsert.mockClear();
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'full',
    });

    const result = await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(result).toEqual(expect.objectContaining({ status: 'REFUNDED' }));
    expect(memory.balance()).toBe(0);
    expect(memory.audits).toHaveLength(1);
    expect(memory.audits[0]).toEqual(
      expect.objectContaining({
        kind: 'shortfall',
        creditsRecovered: 0,
        creditsUnrecovered: 1,
        purchaseId: row.id,
        venueId: VENUE.id,
      }),
    );
  });

  it('estorno total com saldo parcial desconta só o disponível', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(),
      credits: 5,
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 2 },
      update: { balance: { increment: 2 } },
    });
    prisma.creditWallet.upsert.mockClear();
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'full',
    });

    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(memory.rows.get(row.id as string)?.status).toBe('REFUNDED');
    expect(memory.balance()).toBe(0);
    expect(memory.audits).toHaveLength(1);
    expect(memory.audits[0]).toEqual(
      expect.objectContaining({
        kind: 'shortfall',
        creditsRecovered: 2,
        creditsUnrecovered: 3,
      }),
    );
  });

  it('confirmação e estorno simultâneos não deixam crédito indevido', async () => {
    const store = installSnapshotCardStore(prisma);
    const purchaseId = cardOperationPurchaseId(VENUE.id, cardKey);
    store.seed({
      id: purchaseId,
      venueId: VENUE.id,
      provider: 'card',
      providerTxId: 'card:ORD01CARD',
      status: 'PENDING',
      amountPaid: UNIT.priceBrl,
      credits: UNIT.credits,
      currency: 'BRL',
      packageKey: 'unit_1',
      confirmedAt: null,
    });
    const statuses = ['PAID', 'REFUNDED'];
    const pix = mockConfiguredPix({
      extractOrderId: jest.fn().mockReturnValue('ORD01CARD'),
      getOrder: jest.fn().mockResolvedValue({
        orderId: 'ORD01CARD',
        paymentId: 'PAY01CARD',
        status: 'PAID',
        amountBrl: UNIT.priceBrl,
        currency: 'BRL',
        externalReference: purchaseId,
        expiresAt: null,
      }),
    });
    payments.pixProvider.mockReturnValue(pix);
    const createCharge = jest.fn();
    payments.cardProvider.mockReturnValue({
      id: 'card',
      isConfigured: true,
      publicKey: 'TEST-public-key',
      createCharge,
      getOrder: jest.fn().mockImplementation(async () =>
        cardOrder(purchaseId, {
          status: statuses.shift() ?? 'REFUNDED',
          refundScope: statuses.length === 0 ? 'full' : 'none',
        }),
      ),
    });

    await Promise.all([
      service.purchaseById(USER_ID, purchaseId),
      service.handlePixWebhook({ data: { id: 'ORD01CARD' } }),
    ]);

    expect(store.status(purchaseId)).toBe('REFUNDED');
    expect(store.balance()).toBe(0);
    expect(store.creditsAdded()).toBeLessThanOrEqual(1);
    expect(store.creditsRemoved()).toBeLessThanOrEqual(1);
    expect(store.creditsAdded()).toBe(store.creditsRemoved());
    expect(createCharge).not.toHaveBeenCalled();
    const locked = prisma.$queryRaw.mock.calls.some((call) =>
      Array.from(call[0] as TemplateStringsArray).join(' ').includes('FOR UPDATE'),
    );
    expect(locked).toBe(true);
  });

  it('reconciliação de compra paga aplica estorno sem webhook e sem nova cobrança', async () => {
    const memory = installCardMemory(prisma);
    const old = new Date(Date.now() - 20 * 60 * 1000);
    const fresh = new Date();
    const paid = seedCardRow(memory, { status: 'PAID', confirmedAt: old });
    memory.rows.set('pix-paid', {
      id: 'pix-paid',
      venueId: VENUE.id,
      provider: 'pix',
      providerTxId: 'pix:ORDPIX',
      status: 'PAID',
      amountPaid: UNIT.priceBrl,
      credits: 1,
      currency: 'BRL',
      packageKey: 'unit_1',
      confirmedAt: old,
    });
    memory.rows.set('card-fresh', {
      id: 'card-fresh',
      venueId: VENUE.id,
      provider: 'card',
      providerTxId: 'card:ORDFRESH',
      status: 'PAID',
      amountPaid: UNIT.priceBrl,
      credits: 1,
      currency: 'BRL',
      packageKey: 'unit_1',
      confirmedAt: fresh,
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
    const createCharge = jest.fn();
    const getOrder = jest.fn().mockResolvedValue(
      cardOrder(paid.id as string, { status: 'REFUNDED', refundScope: 'full' }),
    );
    useCard(createCharge, getOrder);

    const now = new Date();
    const result = await service.reconcilePaidCardPurchases(now);

    expect(result.skipped).toBe(false);
    expect(result.refunded).toBe(1);
    expect(result.errors).toBe(0);
    expect(memory.rows.get(paid.id as string)?.status).toBe('REFUNDED');
    expect(memory.rows.get('pix-paid')?.status).toBe('PAID');
    expect(memory.rows.get('card-fresh')?.status).toBe('PAID');
    expect(memory.balance()).toBe(0);
    expect(getOrder).toHaveBeenCalledTimes(1);
    expect(getOrder).toHaveBeenCalledWith('ORD01CARD', {
      timeoutMs: CARD_RECONCILE_GET_TIMEOUT_MS,
    });
    expect(createCharge).not.toHaveBeenCalled();
  });

  it('falha ao consultar a order paga deixa a compra para nova tentativa', async () => {
    const memory = installCardMemory(prisma);
    const paid = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
    const createCharge = jest.fn();
    const getOrder = jest
      .fn()
      .mockRejectedValueOnce(new ServiceUnavailableException('timeout'))
      .mockResolvedValueOnce(
        cardOrder(paid.id as string, { status: 'REFUNDED', refundScope: 'full' }),
      );
    useCard(createCharge, getOrder);
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const failed = await service.reconcilePaidCardPurchases(new Date());
    expect(failed.errors).toBe(1);
    expect(memory.rows.get(paid.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(1);
    expect(createCharge).not.toHaveBeenCalled();

    const again = await service.reconcilePaidCardPurchases(new Date());
    expect(again.refunded).toBe(1);
    expect(memory.rows.get(paid.id as string)?.status).toBe('REFUNDED');
    expect(memory.balance()).toBe(0);
    expect(logged.mock.calls.flat().join(' ')).toContain('result retry');
    logged.mockRestore();
  });

  it('estorno parcial não desconta e não vira estorno total', async () => {
    const { memory, row } = await seedPaidCardBalance(UNIT.credits);
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'partial',
      refundedAmountBrl: 10,
      refundId: 'REF01CARD',
    });

    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(memory.rows.get(row.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(UNIT.credits);
    expect(memory.audits).toHaveLength(1);
    expect(memory.audits[0]).toEqual(
      expect.objectContaining({
        kind: 'partial_review',
        originalAmount: UNIT.priceBrl,
        refundedAmount: 10,
        refundId: 'REF01CARD',
      }),
    );
  });

  it('fixture sandbox com reference_id diferente permanece PAID e registra R$ 10', async () => {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-test-token-secret';
    const parser = new CardPaymentProvider({
      getOrder: jest.fn().mockResolvedValue({
        status: 200,
        data: sandboxPartialCardOrder(),
      }),
    } as never);
    const verified = await parser.getOrder(SANDBOX_PARTIAL_ORDER_ID);
    expect(cardRefundAction(verified)).toBe('partial');
    expect(verified.refundScope).toBe('partial');
    expect(verified.refundedAmountBrl).toBe(10);

    const { memory, row } = await seedPaidCardBalance(21);
    armCardWebhook(row.id as string, {
      status: verified.status,
      refundScope: verified.refundScope,
      refundedAmountBrl: verified.refundedAmountBrl,
      refundId: verified.refundId,
      amountBrl: verified.amountBrl,
      currency: verified.currency,
      paymentId: verified.paymentId,
    });

    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(memory.rows.get(row.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(21);
    expect(memory.audits).toHaveLength(1);
    expect(memory.audits[0]).toEqual(
      expect.objectContaining({
        kind: 'partial_review',
        refundedAmount: 10,
        refundId: SANDBOX_PARTIAL_REFUND_ID,
      }),
    );
    expect(memory.audits.some((audit) => audit.kind === 'refund_review')).toBe(false);
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  function signMercadoPagoWebhook(dataId: string | null, secret = 'whsec_notification_test') {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = secret;
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-test-token-secret';
    const requestId = 'req-webhook-1';
    const ts = '1742505638683';
    const idPart = dataId ? `id:${dataId};` : '';
    const manifest = `${idPart}request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
    return {
      payload: dataId
        ? { type: 'order', id: '999001', data: { id: dataId } }
        : { type: 'order', id: '999001' },
      meta: {
        xSignature: `ts=${ts},v1=${v1}`,
        xRequestId: requestId,
        query: dataId ? { 'data.id': dataId, type: 'order' } : { type: 'order' },
      },
    };
  }

  function armSignedCardWebhook(
    purchaseId: string,
    clientGetOrder: jest.Mock = jest.fn().mockResolvedValue({
      status: 200,
      data: {
        id: 'ORD01CARD',
        status: 'processed',
        status_detail: 'partially_refunded',
        total_amount: String(UNIT.priceBrl),
        currency: 'BRL',
        external_reference: purchaseId,
      },
    }),
  ) {
    payments.pixProvider.mockReturnValue(
      new PixPaymentProvider({ getOrder: clientGetOrder } as never),
    );
    const cardGet = jest.fn().mockResolvedValue(
      cardOrder(purchaseId, {
        status: 'REFUNDED',
        refundScope: 'partial',
        refundedAmountBrl: 10,
        refundId: 'REF01CARD',
      }),
    );
    const createCharge = jest.fn();
    payments.cardProvider.mockReturnValue({
      id: 'card',
      isConfigured: true,
      publicKey: 'TEST-public-key',
      createCharge,
      getOrder: cardGet,
    });
    return { clientGetOrder, cardGet, createCharge };
  }

  it('webhook assinado consulta a ordem e um duplicado não debita de novo', async () => {
    const { memory, row } = await seedPaidCardBalance(21);
    const armed = armSignedCardWebhook(row.id as string);
    const notice = signMercadoPagoWebhook('ORD01CARD');
    const logged = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const first = await service.handlePixWebhook(notice.payload, notice.meta);
    const second = await service.handlePixWebhook(notice.payload, notice.meta);

    expect(first).toEqual(expect.objectContaining({ status: 'PAID' }));
    expect(second).toEqual(expect.objectContaining({ status: 'PAID' }));
    expect(memory.balance()).toBe(21);
    expect(memory.audits).toHaveLength(1);
    expect(memory.audits[0]).toEqual(
      expect.objectContaining({
        kind: 'partial_review',
        refundedAmount: 10,
        refundId: 'REF01CARD',
      }),
    );
    expect(armed.createCharge).not.toHaveBeenCalled();
    expect(armed.clientGetOrder).toHaveBeenCalledTimes(2);
    const lines = logged.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes('signature accepted'))).toBe(true);
    expect(lines.some((line) => line.includes('refund partial amount 10'))).toBe(true);
    expect(lines.some((line) => line.includes('http 200'))).toBe(true);
    expect(lines.join('\n')).not.toContain('whsec_notification_test');
    expect(lines.join('\n')).not.toContain('APP_USR-test-token-secret');
    logged.mockRestore();
  });

  it('notificação real em maiúsculas usa a query e não o body numérico', async () => {
    const orderId = 'ORDTST01M4EJXGH4C0JXW2Z603Y25GBB';
    const { memory, row } = await seedPaidCardBalance(21);
    const clientGetOrder = jest.fn().mockResolvedValue({
      status: 200,
      data: {
        id: orderId,
        status: 'refunded',
        status_detail: 'refunded',
        total_amount: '34.90',
        currency: 'BRL',
        external_reference: 'compra-ausente',
      },
    });
    const armed = armSignedCardWebhook(row.id as string, clientGetOrder);
    const notice = signMercadoPagoWebhook(orderId);
    notice.payload = { type: 'order', id: '123456', data: { id: '123456' } };

    await expect(service.handlePixWebhook(notice.payload, notice.meta)).resolves.toEqual({
      received: true,
    });

    expect(armed.clientGetOrder).toHaveBeenCalledWith(expect.any(String), orderId);
    expect(armed.cardGet).not.toHaveBeenCalled();
    expect(memory.balance()).toBe(21);
    expect(memory.audits).toHaveLength(0);
  });

  it('rejeita assinatura inválida sem consultar a Orders API', async () => {
    const { memory, row } = await seedPaidCardBalance(21);
    const armed = armSignedCardWebhook(row.id as string);
    const notice = signMercadoPagoWebhook('ORD01CARD');
    notice.meta.xSignature = notice.meta.xSignature.replace(/v1=[a-f0-9]+/, 'v1=deadbeef');

    await expect(
      service.handlePixWebhook(notice.payload, notice.meta),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(armed.clientGetOrder).not.toHaveBeenCalled();
    expect(armed.cardGet).not.toHaveBeenCalled();
    expect(memory.balance()).toBe(21);
    expect(memory.audits).toHaveLength(0);
  });

  it('identificador ausente ou incompatível não consulta a ordem', async () => {
    const { memory, row } = await seedPaidCardBalance(21);
    const armed = armSignedCardWebhook(row.id as string);

    const absent = signMercadoPagoWebhook(null);
    await expect(service.handlePixWebhook(absent.payload, absent.meta)).resolves.toEqual({
      received: true,
    });

    const incompatible = signMercadoPagoWebhook('123456');
    await expect(
      service.handlePixWebhook(incompatible.payload, incompatible.meta),
    ).resolves.toEqual({ received: true });

    expect(armed.clientGetOrder).not.toHaveBeenCalled();
    expect(memory.balance()).toBe(21);
    expect(memory.audits).toHaveLength(0);
  });

  it('falha temporária da Orders API não grava e a reentrega registra o parcial uma vez', async () => {
    const { memory, row } = await seedPaidCardBalance(21);
    const clientGetOrder = jest
      .fn()
      .mockResolvedValueOnce({ status: 503, data: { message: 'unavailable' } })
      .mockResolvedValue({
        status: 200,
        data: {
          id: 'ORD01CARD',
          status: 'processed',
          status_detail: 'partially_refunded',
          total_amount: String(UNIT.priceBrl),
          currency: 'BRL',
          external_reference: row.id,
        },
      });
    armSignedCardWebhook(row.id as string, clientGetOrder);
    const notice = signMercadoPagoWebhook('ORD01CARD');

    await expect(
      service.handlePixWebhook(notice.payload, notice.meta),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(memory.rows.get(row.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(21);
    expect(memory.audits).toHaveLength(0);

    const retried = await service.handlePixWebhook(notice.payload, notice.meta);
    await service.handlePixWebhook(notice.payload, notice.meta);

    expect(retried).toEqual(expect.objectContaining({ status: 'PAID' }));
    expect(memory.balance()).toBe(21);
    expect(memory.audits).toHaveLength(1);
    expect(memory.audits[0]).toEqual(
      expect.objectContaining({ kind: 'partial_review', refundedAmount: 10 }),
    );
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('sobe o parcial acumulado e não reduz o valor já comprovado', async () => {
    const { memory, row } = await seedPaidCardBalance(UNIT.credits);
    const send = async (amount: number, refundId: string) => {
      armCardWebhook(row.id as string, {
        status: 'REFUNDED',
        refundScope: 'partial',
        refundedAmountBrl: amount,
        refundId,
      });
      await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    };

    await send(10, 'REF-A');
    await send(10, 'REF-A');
    await send(20, 'REF-B');
    await send(15, 'REF-MENOR');

    expect(memory.rows.get(row.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(UNIT.credits);
    expect(memory.audits).toHaveLength(1);
    expect(memory.audits[0]).toEqual(
      expect.objectContaining({
        kind: 'partial_review',
        refundedAmount: 20,
        refundId: 'REF-B',
      }),
    );
  });

  it('reembolso sem valor comprovado não debita no webhook nem na reconciliação', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: UNIT.credits },
      update: { balance: { increment: UNIT.credits } },
    });
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'review',
      refundedAmountBrl: null,
      refundId: null,
    });

    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    const reconciled = await service.reconcilePaidCardPurchases(new Date());

    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    const again = await service.reconcilePaidCardPurchases(new Date());

    expect(reconciled.refunded).toBe(0);
    expect(reconciled.partial).toBe(0);
    expect(again.refunded).toBe(0);
    expect(again.partial).toBe(0);
    expect(memory.rows.get(row.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(UNIT.credits);
    expect(memory.audits).toHaveLength(1);
    expect(memory.audits[0]).toMatchObject({
      kind: 'refund_review',
      refundedAmount: null,
      refundId: null,
      creditsRecovered: null,
      creditsUnrecovered: null,
      originalAmount: UNIT.priceBrl,
    });
  });

  it('review com referência divergente não confirma, não credita e não audita', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: UNIT.credits },
      update: { balance: { increment: UNIT.credits } },
    });
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'review',
      refundedAmountBrl: null,
      refundId: null,
      externalReference: 'outra-compra',
    });

    const result = await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    expect(result).toEqual(expect.objectContaining({ status: 'PAID' }));
    expect(memory.rows.get(row.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(UNIT.credits);
    expect(memory.audits).toHaveLength(0);
  });

  it('reembolso parcial comprovado depois preserva a verificação e não debita', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: UNIT.credits },
      update: { balance: { increment: UNIT.credits } },
    });
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'review',
      refundedAmountBrl: null,
      refundId: null,
    });
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    armCardWebhook(row.id as string, {
      status: 'PAID',
      refundScope: 'partial',
      refundedAmountBrl: 10,
      refundId: 'REF-PARCIAL',
    });
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    await service.reconcilePaidCardPurchases(new Date());

    expect(memory.rows.get(row.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(UNIT.credits);
    expect(memory.audits.map((audit) => audit.kind).sort()).toEqual([
      'partial_review',
      'refund_review',
    ]);
    expect(memory.audits.find((audit) => audit.kind === 'refund_review')).toMatchObject({
      refundedAmount: null,
      refundId: null,
    });
  });

  it('estorno total comprovado depois debita uma vez e mantém a verificação', async () => {
    const memory = installCardMemory(prisma);
    const row = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: UNIT.credits },
      update: { balance: { increment: UNIT.credits } },
    });
    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'review',
      refundedAmountBrl: null,
      refundId: null,
    });
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });

    armCardWebhook(row.id as string, {
      status: 'REFUNDED',
      refundScope: 'full',
      refundedAmountBrl: UNIT.priceBrl,
      refundId: 'REF-TOTAL',
    });
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    await service.reconcilePaidCardPurchases(new Date());

    expect(memory.rows.get(row.id as string)?.status).toBe('REFUNDED');
    expect(memory.balance()).toBe(0);
    expect(memory.audits.map((audit) => audit.kind)).toEqual(['refund_review']);
  });

  it('percorre 2000 compras pagas em lotes e volta ao início', async () => {
    const memory = installCardMemory(prisma);
    const base = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const ids = seedPaidCards(memory, 2000, (index) => new Date(base.getTime() + index * 1000));
    const seen: string[] = [];
    const createCharge = jest.fn();
    useCard(
      createCharge,
      jest.fn(async (orderId: string) => {
        seen.push(orderId);
        return { orderId, status: 'PAID', refundScope: 'none' };
      }),
    );

    for (let batch = 0; batch < 100; batch += 1) {
      const result = await service.reconcilePaidCardPurchases(new Date());
      expect(result.checked).toBe(20);
      expect(result.errors).toBe(0);
    }
    expect(seen).toEqual(ids.map((id) => `ORD${id}`));
    expect(new Set(seen).size).toBe(2000);
    expect(memory.cursor()?.purchaseId).toBe('c1999');

    const wrap = await service.reconcilePaidCardPurchases(new Date());
    expect(wrap.checked).toBe(0);
    expect(memory.cursor()).toBeNull();
    expect(seen).toHaveLength(2000);

    await service.reconcilePaidCardPurchases(new Date());
    expect(seen[2000]).toBe('ORDc0000');
    expect(createCharge).not.toHaveBeenCalled();
    expect([...memory.rows.values()].every((row) => row.status === 'PAID')).toBe(true);
  }, 20000);

  it('desempata confirmedAt pelo id e o lote curto reinicia o cursor', async () => {
    const memory = installCardMemory(prisma);
    const when = new Date(Date.now() - 60 * 60 * 1000);
    memory.rows.set('b-same', {
      id: 'b-same',
      venueId: VENUE.id,
      provider: 'card',
      providerTxId: 'card:ORDB',
      status: 'PAID',
      amountPaid: UNIT.priceBrl,
      credits: 1,
      currency: 'BRL',
      packageKey: 'unit_1',
      confirmedAt: when,
    });
    memory.rows.set('a-same', {
      id: 'a-same',
      venueId: VENUE.id,
      provider: 'card',
      providerTxId: 'card:ORDA',
      status: 'PAID',
      amountPaid: UNIT.priceBrl,
      credits: 1,
      currency: 'BRL',
      packageKey: 'unit_1',
      confirmedAt: when,
    });
    const seen: string[] = [];
    useCard(
      jest.fn(),
      jest.fn(async (orderId: string) => {
        seen.push(orderId);
        return { orderId, status: 'PAID', refundScope: 'none' };
      }),
    );

    const first = await service.reconcilePaidCardPurchases(new Date());
    expect(first.checked).toBe(2);
    expect(seen).toEqual(['ORDA', 'ORDB']);
    expect(memory.cursor()).toBeNull();

    await service.reconcilePaidCardPurchases(new Date());
    expect(seen).toEqual(['ORDA', 'ORDB', 'ORDA', 'ORDB']);
  });

  it('identificador inválido avança o cursor e a compra seguinte é consultada', async () => {
    const memory = installCardMemory(prisma);
    const older = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const newer = new Date(Date.now() - 60 * 60 * 1000);
    memory.rows.set('invalid', {
      id: 'invalid',
      venueId: VENUE.id,
      provider: 'card',
      providerTxId: 'card:op:blocked',
      status: 'PAID',
      amountPaid: UNIT.priceBrl,
      credits: 1,
      currency: 'BRL',
      packageKey: 'unit_1',
      confirmedAt: older,
    });
    memory.rows.set('valid', {
      id: 'valid',
      venueId: VENUE.id,
      provider: 'card',
      providerTxId: 'card:ORDVALID',
      status: 'PAID',
      amountPaid: UNIT.priceBrl,
      credits: 1,
      currency: 'BRL',
      packageKey: 'unit_1',
      confirmedAt: newer,
    });
    const getOrder = jest.fn(async (orderId: string) => ({
      orderId,
      status: 'PAID',
      refundScope: 'none',
    }));
    useCard(jest.fn(), getOrder);
    const logged = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const result = await service.reconcilePaidCardPurchases(new Date());

    expect(result.errors).toBe(1);
    expect(result.checked).toBe(2);
    expect(getOrder).toHaveBeenCalledTimes(1);
    expect(getOrder).toHaveBeenCalledWith('ORDVALID', {
      timeoutMs: CARD_RECONCILE_GET_TIMEOUT_MS,
    });
    expect(memory.rows.get('invalid')?.status).toBe('PAID');
    expect(memory.cursor()).toBeNull();
    logged.mockRestore();
  });

  it('lote incompleto reinicia e a compra antiga paga entra de novo', async () => {
    const memory = installCardMemory(prisma);
    const base = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const ids = seedPaidCards(memory, 25, (index) => new Date(base.getTime() + index * 1000));
    const seen: string[] = [];
    useCard(
      jest.fn(),
      jest.fn(async (orderId: string) => {
        seen.push(orderId);
        return { orderId, status: 'PAID', refundScope: 'none' };
      }),
    );

    await service.reconcilePaidCardPurchases(new Date());
    expect(memory.cursor()?.purchaseId).toBe(ids[19]);
    await service.reconcilePaidCardPurchases(new Date());
    expect(seen).toHaveLength(25);
    expect(memory.cursor()).toBeNull();
    await service.reconcilePaidCardPurchases(new Date());
    expect(seen[25]).toBe(`ORD${ids[0]}`);
    expect(memory.rows.get(ids[0])?.status).toBe('PAID');
  });

  it('reinício da aplicação continua do cursor gravado', async () => {
    const memory = installCardMemory(prisma);
    const base = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    seedPaidCards(memory, 30, (index) => new Date(base.getTime() + index * 1000));
    const seen: string[] = [];
    useCard(
      jest.fn(),
      jest.fn(async (orderId: string) => {
        seen.push(orderId);
        return { orderId, status: 'PAID', refundScope: 'none' };
      }),
    );

    await service.reconcilePaidCardPurchases(new Date());
    const restarted = new CreditsService(
      prisma as never,
      payments as unknown as PaymentProviderRegistry,
    );
    await restarted.reconcilePaidCardPurchases(new Date());

    expect(seen[0]).toBe('ORDc0000');
    expect(seen[20]).toBe('ORDc0020');
    expect(seen).toHaveLength(30);
    expect(memory.cursor()).toBeNull();
  });

  it('perda do lease interrompe o lote sem gravar o cursor', async () => {
    const memory = installCardMemory(prisma);
    const base = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    seedPaidCards(memory, 2, (index) => new Date(base.getTime() + index * 1000));
    const seen: string[] = [];
    useCard(
      jest.fn(),
      jest.fn(async (orderId: string) => {
        seen.push(orderId);
        return { orderId, status: 'PAID', refundScope: 'none' };
      }),
    );
    const original = prisma.$executeRaw.getMockImplementation();
    let advances = 0;
    prisma.$executeRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.from(strings).join(' ');
      if (sql.includes('cursorConfirmedAt') && !sql.includes('= NULL')) {
        advances += 1;
        if (advances === 1) return 0;
      }
      return original?.call(prisma.$executeRaw, strings, ...values);
    });

    const result = await service.reconcilePaidCardPurchases(new Date());

    expect(result.checked).toBe(1);
    expect(seen).toEqual(['ORDc0000']);
    expect(memory.cursor()).toBeNull();
    expect([...memory.rows.values()].every((row) => row.status === 'PAID')).toBe(true);
  });

  it('outra instância não avança o cursor enquanto o lease está ocupado', async () => {
    const memory = installCardMemory(prisma);
    const base = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    seedPaidCards(memory, 20, (index) => new Date(base.getTime() + index * 1000));
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    useCard(
      jest.fn(),
      jest.fn(async (orderId: string) => {
        entered();
        await hold;
        return { orderId, status: 'PAID', refundScope: 'none' };
      }),
    );

    const first = service.reconcilePaidCardPurchases(new Date());
    await waiting;
    const second = await service.reconcilePaidCardPurchases(new Date());
    const stolen = await advanceCardReconcileCursor(prisma, new Date(), 'other-token', {
      confirmedAt: base,
      purchaseId: 'c0000',
    });
    const renewed = await renewCardReconcileLease(prisma, new Date(), 'other-token');
    await releaseCardReconcileLease(prisma, new Date(), 'other-token');
    expect(second.skipped).toBe(true);
    expect(stolen).toBe(false);
    expect(renewed).toBe(false);
    expect(memory.leaseBy()).not.toBe('');
    expect(memory.leaseBy()).not.toBe('other-token');
    expect(memory.cursor()).toBeNull();
    release();
    const done = await first;
    expect(done.checked).toBe(20);
    expect(memory.cursor()?.purchaseId).toBe('c0019');
  });

  it('segunda volta não debita de novo um estorno já aplicado', async () => {
    const memory = installCardMemory(prisma);
    const paid = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
    const createCharge = jest.fn();
    const getOrder = jest.fn(async () =>
      cardOrder(paid.id as string, { status: 'REFUNDED', refundScope: 'full' }),
    );
    useCard(createCharge, getOrder);

    const first = await service.reconcilePaidCardPurchases(new Date());
    const second = await service.reconcilePaidCardPurchases(new Date());

    expect(first.refunded).toBe(1);
    expect(second.checked).toBe(0);
    expect(getOrder).toHaveBeenCalledTimes(1);
    expect(memory.balance()).toBe(0);
    expect(memory.rows.get(paid.id as string)?.status).toBe('REFUNDED');
    expect(memory.audits).toHaveLength(0);
    expect(createCharge).not.toHaveBeenCalled();
  });

  it('renova o lease a cada compra e outra instância não o libera', async () => {
    const memory = installCardMemory(prisma);
    const base = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    seedPaidCards(memory, 3, (index) => new Date(base.getTime() + index * 1000));
    useCard(
      jest.fn(),
      jest.fn(async (orderId: string) => ({
        orderId,
        status: 'PAID',
        refundScope: 'none',
      })),
    );

    const result = await service.reconcilePaidCardPurchases(new Date());

    expect(result.checked).toBe(3);
    expect(memory.renewals()).toBe(6);
    expect(memory.cursor()).toBeNull();
    expect(memory.leaseBy()).toBe('');
  });

  it('lease que expira durante o GET impede o estorno e a compra seguinte', async () => {
    const memory = installCardMemory(prisma);
    const base = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const ids = seedPaidCards(memory, 2, (index) => new Date(base.getTime() + index * 1000));
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
    const seen: string[] = [];
    useCard(
      jest.fn(),
      jest.fn(async (orderId: string) => {
        seen.push(orderId);
        memory.expireLease();
        return cardOrder(ids[0], { status: 'REFUNDED', refundScope: 'full', orderId });
      }),
    );

    const result = await service.reconcilePaidCardPurchases(new Date());

    expect(result.checked).toBe(1);
    expect(result.refunded).toBe(0);
    expect(seen).toEqual(['ORDc0000']);
    expect(memory.rows.get(ids[0])?.status).toBe('PAID');
    expect(memory.balance()).toBe(1);
    expect(memory.audits).toHaveLength(0);
    expect(memory.cursor()).toBeNull();
    expect(prisma.creditPurchase.updateMany).not.toHaveBeenCalled();
  });

  it('posse perdida depois da resposta não abre a transação financeira', async () => {
    const memory = installCardMemory(prisma);
    const paid = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
    useCard(
      jest.fn(),
      jest.fn(async () =>
        cardOrder(paid.id as string, { status: 'REFUNDED', refundScope: 'full' }),
      ),
    );
    const original = prisma.$executeRaw.getMockImplementation();
    let renews = 0;
    prisma.$executeRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.from(strings).join(' ');
      if (
        sql.includes('CardReconcileLock') &&
        !sql.includes('cursorConfirmedAt') &&
        !sql.includes('cooldownUntil') &&
        !sql.includes("= ''")
      ) {
        renews += 1;
        if (renews >= 2) return 0;
      }
      return original?.call(prisma.$executeRaw, strings, ...values);
    });

    const result = await service.reconcilePaidCardPurchases(new Date());

    expect(result.checked).toBe(1);
    expect(result.refunded).toBe(0);
    expect(memory.claims()).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(memory.rows.get(paid.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(1);
    expect(memory.cursor()).toBeNull();
  });

  it('posse perdida dentro da transação não altera compra nem carteira', async () => {
    const memory = installCardMemory(prisma);
    const paid = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
    useCard(
      jest.fn(),
      jest.fn(async () =>
        cardOrder(paid.id as string, { status: 'REFUNDED', refundScope: 'full' }),
      ),
    );
    const original = prisma.$queryRaw.getMockImplementation();
    prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.from(strings).join(' ');
      if (
        sql.includes('CardReconcileLock') &&
        sql.includes('RETURNING') &&
        sql.includes('lockedBy') &&
        sql.includes('lockedUntil" >')
      ) {
        return [];
      }
      return original?.call(prisma.$queryRaw, strings, ...values);
    });

    const result = await service.reconcilePaidCardPurchases(new Date());

    expect(result.refunded).toBe(0);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.creditPurchase.updateMany).not.toHaveBeenCalled();
    expect(memory.rows.get(paid.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(1);
    expect(memory.audits).toHaveLength(0);
    expect(memory.cursor()).toBeNull();
  });

  it('HTTP 429 com Retry-After interrompe o lote sem avançar o cursor', async () => {
    const memory = installCardMemory(prisma);
    const base = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const ids = seedPaidCards(memory, 2, (index) => new Date(base.getTime() + index * 1000));
    const seen: string[] = [];
    useCard(
      jest.fn(),
      jest.fn(async (orderId: string) => {
        seen.push(orderId);
        throw new CardReconcileRateLimitError('30');
      }),
    );
    const before = Date.now();

    const result = await service.reconcilePaidCardPurchases(new Date());

    expect(result.checked).toBe(1);
    expect(result.errors).toBe(1);
    expect(seen).toEqual(['ORDc0000']);
    expect(memory.cursor()).toBeNull();
    expect(memory.rows.get(ids[0])?.status).toBe('PAID');
    expect(memory.rows.get(ids[1])?.status).toBe('PAID');
    const cooldown = memory.cooldown()?.getTime() ?? 0;
    expect(cooldown).toBeGreaterThanOrEqual(before + 29_000);
    expect(cooldown).toBeLessThan(before + 40_000);
  });

  it('HTTP 429 sem Retry-After espera 15 minutos e o cooldown sobrevive ao reinício', async () => {
    const memory = installCardMemory(prisma);
    const base = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    seedPaidCards(memory, 2, (index) => new Date(base.getTime() + index * 1000));
    const getOrder = jest.fn(async () => {
      throw new CardReconcileRateLimitError(null);
    });
    useCard(jest.fn(), getOrder);
    const before = Date.now();
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const blocked = await service.reconcilePaidCardPurchases(new Date());
    expect(blocked.errors).toBe(1);
    expect(memory.cursor()).toBeNull();
    const cooldown = memory.cooldown()?.getTime() ?? 0;
    expect(cooldown).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
    expect(cooldown).toBeLessThanOrEqual(before + 15 * 60 * 1000 + 2_000);
    expect(logged.mock.calls.flat().join(' ')).toContain('result rate_limit');
    expect(logged.mock.calls.flat().join(' ')).not.toContain('APP_USR');

    const restarted = new CreditsService(
      prisma as never,
      payments as unknown as PaymentProviderRegistry,
    );
    const during = await restarted.reconcilePaidCardPurchases(new Date());
    expect(during.skipped).toBe(true);
    expect(getOrder).toHaveBeenCalledTimes(1);
    expect(memory.cursor()).toBeNull();

    const later = await restarted.reconcilePaidCardPurchases(
      new Date(Date.now() + 16 * 60 * 1000),
    );
    expect(later.skipped).toBe(false);
    expect(getOrder).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });

  it('Retry-After acima de 15 minutos fica limitado a 15', async () => {
    const memory = installCardMemory(prisma);
    const paid = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    useCard(
      jest.fn(),
      jest.fn(async () => {
        throw new CardReconcileRateLimitError('7200');
      }),
    );
    const before = Date.now();

    await service.reconcilePaidCardPurchases(new Date());

    const cooldown = memory.cooldown()?.getTime() ?? 0;
    expect(cooldown).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
    expect(cooldown).toBeLessThanOrEqual(before + 15 * 60 * 1000 + 2_000);
    expect(memory.rows.get(paid.id as string)?.status).toBe('PAID');
    expect(memory.cursor()).toBeNull();
  });

  it('timeout e HTTP 5xx não alteram a compra e voltam só na volta seguinte', async () => {
    const memory = installCardMemory(prisma);
    const base = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const ids = seedPaidCards(memory, 3, (index) => new Date(base.getTime() + index * 1000));
    const kinds = ['timeout', 'unavailable', 'unavailable'] as const;
    const seen: string[] = [];
    const getOrder = jest.fn(async (orderId: string) => {
      seen.push(orderId);
      const kind = kinds[seen.length - 1] ?? 'unavailable';
      throw new CardReconcileTransportError(kind);
    });
    useCard(jest.fn(), getOrder);
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const failed = await service.reconcilePaidCardPurchases(new Date());

    expect(failed.errors).toBe(3);
    expect(failed.checked).toBe(3);
    expect(getOrder).toHaveBeenCalledTimes(3);
    expect(seen).toEqual(['ORDc0000', 'ORDc0001', 'ORDc0002']);
    expect(ids.every((id) => memory.rows.get(id)?.status === 'PAID')).toBe(true);
    expect(memory.cursor()).toBeNull();
    const text = logged.mock.calls.flat().join(' ');
    expect(text).toContain('result timeout');
    expect(text).toContain('result unavailable');
    expect(text).not.toContain('APP_USR');
    expect(text).not.toContain('Bearer');

    await service.reconcilePaidCardPurchases(new Date());
    expect(getOrder).toHaveBeenCalledTimes(6);
    logged.mockRestore();
  });

  it.each([
    ['valor divergente', { amountBrl: 10 }],
    ['moeda divergente', { currency: 'USD' }],
    ['referência externa divergente', { externalReference: 'outra-compra' }],
    ['tipo de pagamento incorreto', { paymentType: 'debit_card' }],
    ['identificador divergente', { orderId: 'ORDDIVERGE' }],
  ])('%s não altera compra, carteira nem auditoria', async (_label, overrides) => {
    const memory = installCardMemory(prisma);
    const paid = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
    useCard(
      jest.fn(),
      jest.fn(async () =>
        cardOrder(paid.id as string, {
          status: 'REFUNDED',
          refundScope: 'full',
          ...overrides,
        }),
      ),
    );
    const logged = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const result = await service.reconcilePaidCardPurchases(new Date());

    expect(result.refunded).toBe(0);
    expect(result.errors).toBe(1);
    expect(memory.rows.get(paid.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(1);
    expect(memory.audits).toHaveLength(0);
    expect(prisma.creditPurchase.updateMany).not.toHaveBeenCalled();
    expect(logged.mock.calls.flat().join(' ')).toContain('result mismatch');
    logged.mockRestore();
  });

  it('review compatível na reconciliação audita uma vez e não debita', async () => {
    const memory = installCardMemory(prisma);
    const paid = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
    useCard(
      jest.fn(),
      jest.fn(async () =>
        cardOrder(paid.id as string, {
          status: 'REFUNDED',
          refundScope: 'review',
          refundedAmountBrl: null,
          refundId: null,
        }),
      ),
    );

    const first = await service.reconcilePaidCardPurchases(new Date());
    const second = await service.reconcilePaidCardPurchases(new Date());

    expect(first.refunded).toBe(0);
    expect(first.partial).toBe(0);
    expect(second.refunded).toBe(0);
    expect(memory.rows.get(paid.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(1);
    expect(memory.audits).toHaveLength(1);
    expect(memory.audits[0]).toMatchObject({ kind: 'refund_review', refundedAmount: null });
  });

  it('review com identidade divergente não audita nem debita na reconciliação', async () => {
    const memory = installCardMemory(prisma);
    const paid = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
    useCard(
      jest.fn(),
      jest.fn(async () =>
        cardOrder(paid.id as string, {
          status: 'REFUNDED',
          refundScope: 'review',
          refundedAmountBrl: null,
          refundId: null,
          externalReference: 'outra-compra',
        }),
      ),
    );
    const logged = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const result = await service.reconcilePaidCardPurchases(new Date());

    expect(result.refunded).toBe(0);
    expect(result.partial).toBe(0);
    expect(result.errors).toBe(1);
    expect(memory.rows.get(paid.id as string)?.status).toBe('PAID');
    expect(memory.balance()).toBe(1);
    expect(memory.audits).toHaveLength(0);
    expect(prisma.creditPurchase.updateMany).not.toHaveBeenCalled();
    expect(logged.mock.calls.flat().join(' ')).toContain('result mismatch');
    logged.mockRestore();
  });

  it('webhook e reconciliação no mesmo estorno debitam uma vez', async () => {
    const memory = installCardMemory(prisma);
    const paid = seedCardRow(memory, {
      status: 'PAID',
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await prisma.creditWallet.upsert({
      where: { venueId: VENUE.id },
      create: { venueId: VENUE.id, balance: 1 },
      update: { balance: { increment: 1 } },
    });
    payments.pixProvider.mockReturnValue(
      mockConfiguredPix({
        extractOrderId: jest.fn().mockReturnValue('ORD01CARD'),
        getOrder: jest.fn().mockResolvedValue({
          orderId: 'ORD01CARD',
          paymentId: 'PAY01CARD',
          status: 'PAID',
          amountBrl: UNIT.priceBrl,
          currency: 'BRL',
          externalReference: paid.id,
          expiresAt: null,
        }),
      }),
    );
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const createCharge = jest.fn();
    useCard(
      createCharge,
      jest.fn(async (_orderId: string, options?: { timeoutMs?: number }) => {
        if (options?.timeoutMs) {
          entered();
          await hold;
        }
        return cardOrder(paid.id as string, { status: 'REFUNDED', refundScope: 'full' });
      }),
    );

    const reconciling = service.reconcilePaidCardPurchases(new Date());
    await waiting;
    await service.handlePixWebhook({ data: { id: 'ORD01CARD' } });
    release();
    const reconciled = await reconciling;

    expect(memory.rows.get(paid.id as string)?.status).toBe('REFUNDED');
    expect(memory.balance()).toBe(0);
    expect(memory.audits).toHaveLength(0);
    expect(reconciled.refunded).toBe(1);
    expect(createCharge).not.toHaveBeenCalled();
  });
});

function pixPurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pix-p1',
    venueId: VENUE.id,
    packageKey: 'unit_1',
    productId: null,
    amountPaid: UNIT.priceBrl,
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
    amountBrl: UNIT.priceBrl,
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

function matchesReconcileWhere(
  row: Record<string, unknown>,
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where) return true;
  if (Array.isArray(where.AND)) {
    return where.AND.every((part) =>
      matchesReconcileWhere(row, part as Record<string, unknown>),
    );
  }
  if (Array.isArray(where.OR)) {
    return where.OR.some((part) =>
      matchesReconcileWhere(row, part as Record<string, unknown>),
    );
  }
  if (typeof where.provider === 'string' && row.provider !== where.provider) return false;
  if (typeof where.status === 'string' && row.status !== where.status) return false;
  const id = where.id as { gt?: string } | undefined;
  if (id?.gt && !(String(row.id) > id.gt)) return false;
  const confirmed = where.confirmedAt as
    | { not?: null; lt?: Date; gt?: Date; equals?: Date }
    | undefined;
  if (confirmed?.not === null && !(row.confirmedAt instanceof Date)) return false;
  if (
    confirmed?.lt &&
    (!(row.confirmedAt instanceof Date) || row.confirmedAt >= confirmed.lt)
  ) {
    return false;
  }
  if (
    confirmed?.gt &&
    (!(row.confirmedAt instanceof Date) || row.confirmedAt <= confirmed.gt)
  ) {
    return false;
  }
  if (
    confirmed?.equals &&
    (!(row.confirmedAt instanceof Date) ||
      row.confirmedAt.getTime() !== confirmed.equals.getTime())
  ) {
    return false;
  }
  return true;
}

function seedPaidCards(
  memory: { rows: Map<string, Record<string, unknown>> },
  count: number,
  at: (index: number) => Date,
) {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = `c${String(index).padStart(4, '0')}`;
    memory.rows.set(id, {
      id,
      venueId: VENUE.id,
      provider: 'card',
      providerTxId: `card:ORD${id}`,
      status: 'PAID',
      amountPaid: UNIT.priceBrl,
      credits: 1,
      currency: 'BRL',
      packageKey: 'unit_1',
      confirmedAt: at(index),
    });
    ids.push(id);
  }
  return ids;
}

function installCardMemory(db: ReturnType<typeof createPrisma>) {
  const rows = new Map<string, Record<string, unknown>>();
  const audits: Array<Record<string, unknown>> = [];
  let wallet = 0;
  let walletExists = false;
  let leaseUntil = 0;
  let leaseBy = '';
  let cursorConfirmedAt: Date | null = null;
  let cursorPurchaseId: string | null = null;
  let cooldownUntil: Date | null = null;
  let clawbackSql = '';
  let renewals = 0;
  let claims = 0;
  db.creditPurchase.findUnique.mockImplementation(async (args: {
    where: { id?: string; providerTxId?: string };
  }) => {
    if (args?.where?.id) return rows.get(args.where.id) ?? null;
    if (args?.where?.providerTxId) {
      for (const row of rows.values()) {
        if (row.providerTxId === args.where.providerTxId) return row;
      }
    }
    return null;
  });
  db.creditPurchase.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    if (rows.has(String(data.id))) {
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    }
    for (const row of rows.values()) {
      if (data.providerTxId && row.providerTxId === data.providerTxId) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
    }
    const row = { confirmedAt: null, ...data };
    rows.set(String(row.id), row);
    return row;
  });
  db.creditPurchase.update.mockImplementation(async ({
    where,
    data,
  }: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => {
    const row = rows.get(where.id);
    if (!row) throw new Error('missing purchase');
    if (data.providerTxId) {
      for (const other of rows.values()) {
        if (other !== row && other.providerTxId === data.providerTxId) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
      }
    }
    Object.assign(row, data);
    return row;
  });
  db.creditPurchase.updateMany.mockImplementation(async ({
    where,
    data,
  }: {
    where: { id: string; status?: string };
    data: Record<string, unknown>;
  }) => {
    const row = rows.get(where.id);
    if (!row || (where.status && row.status !== where.status)) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  });
  db.creditPurchase.findMany.mockImplementation(async (args: {
    where?: Record<string, unknown>;
    take?: number;
  }) => {
    let list = [...rows.values()];
    if (args?.where) list = list.filter((row) => matchesReconcileWhere(row, args.where));
    list.sort((a, b) => {
      const left = a.confirmedAt instanceof Date ? a.confirmedAt.getTime() : 0;
      const right = b.confirmedAt instanceof Date ? b.confirmedAt.getTime() : 0;
      if (left !== right) return left - right;
      return String(a.id).localeCompare(String(b.id));
    });
    return list.slice(0, args?.take ?? list.length).map((row) => ({ ...row }));
  });
  db.creditWallet.upsert.mockImplementation(async ({
    update,
  }: {
    update: { balance: { increment: number } };
  }) => {
    walletExists = true;
    wallet += update.balance.increment;
    return { venueId: VENUE.id, balance: wallet };
  });
  db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = Array.from(strings).join(' ');
    if (sql.includes('CardReconcileLock') && sql.includes('cursorConfirmedAt')) {
      const token = values[0];
      const now = values[1];
      if (typeof token !== 'string' || !(now instanceof Date)) return [];
      if (leaseBy !== token || leaseUntil <= now.getTime()) return [];
      return [{
        cursorPurchaseId,
        cursorConfirmedAtMs: cursorConfirmedAt ? cursorConfirmedAt.getTime() : null,
        cooldownUntilMs: cooldownUntil ? cooldownUntil.getTime() : null,
      }];
    }
    if (
      sql.includes('CardReconcileLock') &&
      sql.includes('RETURNING') &&
      sql.includes('lockedBy') &&
      sql.includes('lockedUntil" >')
    ) {
      const dates = values.filter((value): value is Date => value instanceof Date);
      const token = values.find((value) => typeof value === 'string');
      const until = dates[0];
      const now = dates[1];
      if (typeof token !== 'string' || !(until instanceof Date) || !(now instanceof Date)) {
        return [];
      }
      if (leaseBy !== token || leaseUntil <= now.getTime()) return [];
      leaseUntil = until.getTime();
      claims += 1;
      return [{ id: 1 }];
    }
    if (sql.includes('CardReconcileLock')) {
      const dates = values.filter((value): value is Date => value instanceof Date);
      const token = values.find((value) => typeof value === 'string');
      const now = dates[1] ?? dates[0];
      const until = dates[0];
      if (!now || !until || typeof token !== 'string') return [];
      if (leaseUntil > now.getTime()) return [];
      leaseUntil = until.getTime();
      leaseBy = token;
      return [{ id: 1 }];
    }
    if (sql.includes('CreditWallet')) {
      if (!sql.includes(CARD_FULL_REFUND_RECOVERABLE_SQL)) {
        throw new Error('card full refund SQL');
      }
      clawbackSql = sql;
      const credits = values.find((value) => typeof value === 'number');
      if (!walletExists || typeof credits !== 'number') return [];
      const previous = wallet;
      const recovered = recoverableCardCredits(previous, credits);
      wallet = previous - recovered;
      return [{ previous, next: wallet }];
    }
    return [];
  });
  db.$executeRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = Array.from(strings).join(' ');
    if (sql.includes('cooldownUntil')) {
      const dates = values.filter((value): value is Date => value instanceof Date);
      const token = values.find((value) => typeof value === 'string');
      const until = dates[0];
      const now = dates[1];
      if (typeof token !== 'string' || !(until instanceof Date) || !(now instanceof Date)) {
        return 0;
      }
      if (leaseBy !== token || leaseUntil <= now.getTime()) return 0;
      cooldownUntil = until;
      return 1;
    }
    if (sql.includes('CardReconcileLock') && sql.includes('cursorConfirmedAt')) {
      const now = values.filter((value): value is Date => value instanceof Date).at(-1);
      const token = sql.includes('= NULL') ? values[0] : values[2];
      if (typeof token !== 'string' || !(now instanceof Date)) return 0;
      if (leaseBy !== token || leaseUntil <= now.getTime()) return 0;
      if (sql.includes('= NULL')) {
        cursorConfirmedAt = null;
        cursorPurchaseId = null;
        return 1;
      }
      const confirmedAt = values[0];
      const purchaseId = values[1];
      if (!(confirmedAt instanceof Date) || typeof purchaseId !== 'string') return 0;
      cursorConfirmedAt = confirmedAt;
      cursorPurchaseId = purchaseId;
      return 1;
    }
    if (sql.includes('CardReconcileLock') && sql.includes("= ''")) {
      const token = values.find((value) => typeof value === 'string' && value.length > 0);
      if (token === leaseBy) {
        leaseUntil = 0;
        leaseBy = '';
      }
      return 1;
    }
    if (sql.includes('CardReconcileLock')) {
      const dates = values.filter((value): value is Date => value instanceof Date);
      const token = values.find((value) => typeof value === 'string');
      const until = dates[0];
      const now = dates[1];
      if (typeof token !== 'string' || !(until instanceof Date) || !(now instanceof Date)) {
        return 0;
      }
      if (leaseBy !== token || leaseUntil <= now.getTime()) return 0;
      leaseUntil = until.getTime();
      renewals += 1;
      return 1;
    }
    if (sql.includes('CreditRefundAudit')) {
      const purchaseId = values[1];
      const kind = values[3];
      const existing = audits.find(
        (row) => row.purchaseId === purchaseId && row.kind === kind,
      );
      if (existing) {
        if (kind === 'partial_review' && sql.includes('DO UPDATE')) {
          const nextCents = Math.round(Number(values[7]) * 100);
          const currentCents = Math.round(Number(existing.refundedAmount) * 100);
          if (Number.isFinite(nextCents) && nextCents > currentCents) {
            existing.refundedAmount = values[7];
            existing.refundId = values[8];
            return 1;
          }
        }
        return 0;
      }
      audits.push({
        id: values[0],
        purchaseId,
        venueId: values[2],
        kind,
        creditsRecovered: values[4],
        creditsUnrecovered: values[5],
        originalAmount: values[6],
        refundedAmount: values[7],
        refundId: values[8],
      });
      return 1;
    }
    return 0;
  });
  return {
    rows,
    audits,
    balance: () => wallet,
    cursor: () =>
      cursorConfirmedAt && cursorPurchaseId
        ? { confirmedAt: cursorConfirmedAt, purchaseId: cursorPurchaseId }
        : null,
    cooldown: () => cooldownUntil,
    clawbackSql: () => clawbackSql,
    renewals: () => renewals,
    claims: () => claims,
    leaseBy: () => leaseBy,
    expireLease: () => {
      leaseUntil = 0;
    },
  };
}

function installSnapshotCardStore(db: ReturnType<typeof createPrisma>) {
  const rows = new Map<string, Record<string, unknown>>();
  let wallet = 0;
  let walletExists = false;
  let added = 0;
  let removed = 0;
  const copy = (row: Record<string, unknown>) => structuredClone(row);

  db.creditPurchase.findUnique.mockImplementation(async (args: {
    where: { id?: string; providerTxId?: string };
  }) => {
    if (args?.where?.id) {
      const row = rows.get(args.where.id);
      return row ? copy(row) : null;
    }
    if (args?.where?.providerTxId) {
      for (const row of rows.values()) {
        if (row.providerTxId === args.where.providerTxId) return copy(row);
      }
    }
    return null;
  });
  db.creditPurchase.update.mockImplementation(async ({
    where,
    data,
  }: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => {
    const row = rows.get(where.id);
    if (!row) throw new Error('missing purchase');
    Object.assign(row, data);
    return copy(row);
  });
  db.creditPurchase.updateMany.mockImplementation(async ({
    where,
    data,
  }: {
    where: { id: string; status?: string };
    data: Record<string, unknown>;
  }) => {
    const row = rows.get(where.id);
    if (!row || (where.status && row.status !== where.status)) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  });
  db.creditWallet.upsert.mockImplementation(async ({
    update,
  }: {
    update: { balance: { increment: number } };
  }) => {
    walletExists = true;
    const increment = update.balance.increment;
    if (increment > 0) added += increment;
    wallet += increment;
    return { venueId: VENUE.id, balance: wallet };
  });
  db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = Array.from(strings).join(' ');
    if (!sql.includes('CreditWallet')) return [];
    if (!sql.includes(CARD_FULL_REFUND_RECOVERABLE_SQL)) {
      throw new Error('card full refund SQL');
    }
    const credits = values.find((value) => typeof value === 'number');
    if (!walletExists || typeof credits !== 'number') return [];
    const previous = wallet;
    const recovered = recoverableCardCredits(previous, credits);
    removed += recovered;
    wallet = previous - recovered;
    return [{ previous, next: wallet }];
  });
  db.$executeRaw.mockImplementation(async () => 1);

  return {
    seed(row: Record<string, unknown>) {
      rows.set(String(row.id), { ...row });
    },
    status: (id: string) => rows.get(id)?.status,
    balance: () => wallet,
    creditsAdded: () => added,
    creditsRemoved: () => removed,
  };
}
