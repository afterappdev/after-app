import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { mockOwnedVenuePrisma } from '../common/test/owned-venue-prisma.mock';
import { CREDIT_PACKAGES } from '../common/constants/credits';
import { CreditsService } from './credits.service';
import { PaymentProviderRegistry } from './providers/payment-providers';
import { VerifiedPayment } from './providers/payment-provider';
import { VIP_CREDIT_PACKAGES } from './vip-catalog';

const USER_ID = 'user-1';
const VENUE = {
  id: 'venue-1',
  ownerUserId: USER_ID,
  owner: { email: 'venue@test.com', name: 'Venue Owner' },
};

const VIP = VIP_CREDIT_PACKAGES[0];
const UNIT = CREDIT_PACKAGES.find((p) => p.key === 'unit_1')!;

function createPrisma() {
  const prisma: {
    venue: { findUnique: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
    creditPurchase: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    creditWallet: { upsert: jest.Mock };
    vipCreditEntry: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  } = {
    venue: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    creditPurchase: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    creditWallet: { upsert: jest.fn() },
    vipCreditEntry: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
    fn(prisma),
  );
  mockOwnedVenuePrisma(prisma, VENUE);
  return prisma;
}

describe('CreditsService store VIP (Google Play)', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let googleVerify: jest.Mock<Promise<VerifiedPayment>, [unknown]>;
  let googleFinalize: jest.Mock<Promise<void>, [unknown, unknown]>;
  let vipCredits: { grant: jest.Mock };
  let adminPush: { notifyPurchasePaid: jest.Mock };
  let service: CreditsService;

  const vipStoreDto = {
    packageKey: 'vip_unit_1' as const,
    productId: 'after.credits.vip.1',
    provider: 'google_play' as const,
    purchaseId: 'gp-vip-1',
    verificationData: 'token-vip',
  };

  beforeEach(() => {
    prisma = createPrisma();
    googleVerify = jest.fn().mockResolvedValue({
      provider: 'google_play',
      productId: VIP.storeProductId,
      externalId: 'GPA.vip-1',
      googlePlayPendingConsume: true,
    });
    googleFinalize = jest.fn().mockResolvedValue(undefined);
    vipCredits = {
      grant: jest.fn().mockResolvedValue({
        applied: true,
        vipBalance: 1,
        balanceDelta: 1,
      }),
    };
    adminPush = { notifyPurchasePaid: jest.fn().mockResolvedValue(undefined) };
    service = new CreditsService(
      prisma as never,
      {
        storeProvider: jest.fn().mockReturnValue({
          id: 'google_play',
          verify: googleVerify,
          finalizeVerifiedPurchase: googleFinalize,
        }),
      } as unknown as PaymentProviderRegistry,
      adminPush as never,
      vipCredits as never,
    );
  });

  it('credita 1 VIP e não altera saldo comum', async () => {
    const paid = {
      id: 'purchase-vip-1',
      venueId: VENUE.id,
      packageKey: VIP.key,
      productId: VIP.storeProductId,
      credits: 1,
      status: 'PAID',
      providerTxId: 'google_play:GPA.vip-1',
    };
    prisma.creditPurchase.findUnique.mockResolvedValueOnce(null);
    prisma.creditPurchase.create.mockResolvedValue(paid);

    const result = await service.confirmStorePurchase(USER_ID, vipStoreDto);

    expect(result.modality).toBe('VIP');
    expect(result.credits).toBe(1);
    expect(vipCredits.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: VENUE.id,
        credits: 1,
        operationKey: `vip:purchase:${paid.id}:grant`,
      }),
      prisma,
    );
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(adminPush.notifyPurchasePaid).toHaveBeenCalledTimes(1);
    expect(googleFinalize).toHaveBeenCalledTimes(1);
  });

  it('não credita VIP duas vezes para a mesma transação', async () => {
    const paid = {
      id: 'purchase-vip-dup',
      venueId: VENUE.id,
      status: 'PAID',
      providerTxId: 'google_play:GPA.vip-1',
      packageKey: VIP.key,
      productId: VIP.storeProductId,
      credits: 1,
    };
    prisma.creditPurchase.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(paid);
    prisma.creditPurchase.create.mockResolvedValue(paid);

    await service.confirmStorePurchase(USER_ID, vipStoreDto);
    await service.confirmStorePurchase(USER_ID, vipStoreDto);

    expect(prisma.creditPurchase.create).toHaveBeenCalledTimes(1);
    expect(vipCredits.grant).toHaveBeenCalledTimes(1);
    expect(adminPush.notifyPurchasePaid).toHaveBeenCalledTimes(1);
    expect(googleFinalize).toHaveBeenCalledTimes(2);
  });

  it('rejeita reutilização da mesma transação em outro estabelecimento', async () => {
    const paid = {
      id: 'purchase-vip-other',
      venueId: 'venue-other',
      status: 'PAID',
      providerTxId: 'google_play:GPA.vip-1',
      packageKey: VIP.key,
      productId: VIP.storeProductId,
      credits: 1,
    };
    prisma.creditPurchase.findUnique.mockResolvedValueOnce(paid);
    await expect(
      service.confirmStorePurchase(USER_ID, vipStoreDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(vipCredits.grant).not.toHaveBeenCalled();
    expect(googleFinalize).not.toHaveBeenCalled();
  });

  it('falha de consume após crédito não impede resposta idempotente', async () => {
    googleFinalize.mockRejectedValueOnce(new BadRequestException('Consume failed'));
    const paid = {
      id: 'purchase-vip-consume',
      venueId: VENUE.id,
      packageKey: VIP.key,
      productId: VIP.storeProductId,
      credits: 1,
      status: 'PAID',
      providerTxId: 'google_play:GPA.vip-1',
    };
    prisma.creditPurchase.findUnique.mockResolvedValueOnce(null);
    prisma.creditPurchase.create.mockResolvedValue(paid);

    const result = await service.confirmStorePurchase(USER_ID, vipStoreDto);
    expect(result.modality).toBe('VIP');
    expect(googleFinalize).toHaveBeenCalledTimes(1);
  });

  it('retry após falha de consume reinvoca finalize sem novo grant', async () => {
    googleFinalize
      .mockRejectedValueOnce(new BadRequestException('Consume failed'))
      .mockResolvedValueOnce(undefined);
    const paid = {
      id: 'purchase-vip-retry-consume',
      venueId: VENUE.id,
      packageKey: VIP.key,
      productId: VIP.storeProductId,
      credits: 1,
      status: 'PAID',
      providerTxId: 'google_play:GPA.vip-1',
    };
    prisma.creditPurchase.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(paid);
    prisma.creditPurchase.create.mockResolvedValue(paid);

    await service.confirmStorePurchase(USER_ID, vipStoreDto);
    const replay = await service.confirmStorePurchase(USER_ID, vipStoreDto);

    expect(replay.id).toBe('purchase-vip-retry-consume');
    expect(vipCredits.grant).toHaveBeenCalledTimes(1);
    expect(googleFinalize).toHaveBeenCalledTimes(2);
  });

  it('P2002 na criação retorna compra existente sem segundo grant', async () => {
    const paid = {
      id: 'purchase-vip-p2002',
      venueId: VENUE.id,
      packageKey: VIP.key,
      productId: VIP.storeProductId,
      credits: 1,
      status: 'PAID',
      providerTxId: 'google_play:GPA.vip-1',
    };
    prisma.creditPurchase.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(paid);
    prisma.creditPurchase.create.mockRejectedValueOnce({ code: 'P2002' });

    const result = await service.confirmStorePurchase(USER_ID, vipStoreDto);

    expect(result.id).toBe('purchase-vip-p2002');
    expect(vipCredits.grant).not.toHaveBeenCalled();
  });

  it('corrida paralela: P2002 na segunda criação evita grant duplicado', async () => {
    const paid = {
      id: 'purchase-vip-parallel',
      venueId: VENUE.id,
      packageKey: VIP.key,
      productId: VIP.storeProductId,
      credits: 1,
      status: 'PAID',
      providerTxId: 'google_play:GPA.vip-1',
    };
    let creates = 0;
    prisma.creditPurchase.findUnique.mockImplementation(async () =>
      creates > 0 ? paid : null,
    );
    prisma.creditPurchase.create.mockImplementation(async () => {
      creates += 1;
      if (creates > 1) {
        const err = new Error('unique') as Error & { code?: string };
        err.code = 'P2002';
        throw err;
      }
      return paid;
    });

    const [first, second] = await Promise.all([
      service.confirmStorePurchase(USER_ID, vipStoreDto),
      service.confirmStorePurchase(USER_ID, vipStoreDto),
    ]);

    expect(first.id).toBe('purchase-vip-parallel');
    expect(second.id).toBe('purchase-vip-parallel');
    expect(vipCredits.grant).toHaveBeenCalledTimes(1);
  });

  it('rejeita productId VIP com packageKey comum', async () => {
    googleVerify.mockResolvedValue({
      provider: 'google_play',
      productId: VIP.storeProductId,
      externalId: 'GPA.bad',
    });
    await expect(
      service.confirmStorePurchase(USER_ID, {
        ...vipStoreDto,
        packageKey: UNIT.key,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(vipCredits.grant).not.toHaveBeenCalled();
  });

  it('rejeita productId desconhecido', async () => {
    googleVerify.mockResolvedValue({
      provider: 'google_play',
      productId: 'after.creditsvip.1',
      externalId: 'GPA.x',
    });
    await expect(
      service.confirmStorePurchase(USER_ID, {
        ...vipStoreDto,
        productId: 'after.creditsvip.1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falha quando serviço VIP não está disponível', async () => {
    const withoutVip = new CreditsService(
      prisma as never,
      {
        storeProvider: jest.fn().mockReturnValue({
          id: 'google_play',
          verify: googleVerify,
        }),
      } as unknown as PaymentProviderRegistry,
      adminPush as never,
    );
    await expect(
      withoutVip.confirmStorePurchase(USER_ID, vipStoreDto),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('propaga falha de validação do Google Play', async () => {
    googleVerify.mockRejectedValue(
      new BadRequestException('Compra do Google Play não está paga.'),
    );
    await expect(
      service.confirmStorePurchase(USER_ID, vipStoreDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(vipCredits.grant).not.toHaveBeenCalled();
  });

  it('regressão: pacote comum continua creditando balance', async () => {
    googleVerify.mockResolvedValue({
      provider: 'google_play',
      productId: UNIT.storeProductId,
      externalId: 'GPA.common',
    });
    const paid = {
      id: 'p-common',
      venueId: VENUE.id,
      status: 'PAID',
      providerTxId: 'google_play:GPA.common',
      credits: UNIT.credits,
    };
    prisma.creditPurchase.findUnique.mockResolvedValueOnce(null);
    prisma.creditPurchase.create.mockResolvedValue(paid);
    prisma.creditWallet.upsert.mockResolvedValue({
      venueId: VENUE.id,
      balance: UNIT.credits,
    });

    const result = await service.confirmStorePurchase(USER_ID, {
      packageKey: UNIT.key,
      productId: UNIT.storeProductId,
      provider: 'google_play',
      purchaseId: 'gp-c',
      verificationData: 'tok',
    });

    expect(result.modality).toBe('COMMON');
    expect(prisma.creditWallet.upsert).toHaveBeenCalled();
    expect(vipCredits.grant).not.toHaveBeenCalled();
  });
});
