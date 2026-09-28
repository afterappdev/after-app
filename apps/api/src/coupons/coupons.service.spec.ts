import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CouponsService } from './coupons.service';

const venueUser: AuthUser = {
  userId: 'owner-1',
  email: 'bar@after.local',
  role: 'VENUE',
};

const adminUser: AuthUser = {
  userId: 'admin-1',
  email: 'admin@after.local',
  role: 'ADMIN',
};

function coupon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coupon-1',
    code: 'AFTER2',
    creditAmount: 2,
    active: true,
    startsAt: null,
    expiresAt: null,
    maxRedemptions: null,
    maxRedemptionsPerVenue: 1,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    _count: { redemptions: 0 },
    ...overrides,
  };
}

function setup() {
  const prisma = {
    creditCoupon: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    creditCouponRedemption: {
      count: jest.fn(),
      create: jest.fn(),
    },
    creditWallet: {
      upsert: jest.fn(),
    },
    venue: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'coupon-1' }]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof prisma) => unknown)(prisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  prisma.venue.findUnique.mockResolvedValue({
    id: 'venue-1',
    name: 'Bar Central',
    city: 'São Paulo',
  });
  const service = new CouponsService(prisma as never);
  return { prisma, service };
}

describe('CouponsService', () => {
  it('cria cupom normalizando o código', async () => {
    const { prisma, service } = setup();
    prisma.creditCoupon.create.mockImplementation(async ({ data }) =>
      coupon({ ...data, _count: { redemptions: 0 } }),
    );

    const created = await service.create(adminUser, {
      code: ' after2 ',
      creditAmount: 2,
    });

    expect(created.code).toBe('AFTER2');
    expect(created.creditAmount).toBe(2);
    expect(prisma.creditCoupon.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'AFTER2',
          creditAmount: 2,
          maxRedemptionsPerVenue: 1,
          createdById: 'admin-1',
        }),
      }),
    );
  });

  it('rejeita código duplicado', async () => {
    const { prisma, service } = setup();
    prisma.creditCoupon.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );

    await expect(
      service.create(adminUser, { code: 'AFTER2', creditAmount: 2 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejeita créditos inválidos e janela invertida', async () => {
    const { service } = setup();
    await expect(
      service.create(adminUser, { code: 'AFTER2', creditAmount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(adminUser, {
        code: 'AFTER2',
        creditAmount: 2,
        startsAt: '2026-10-02T00:00:00.000Z',
        expiresAt: '2026-10-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resgata cupom válido e credita exatamente o valor do banco', async () => {
    const { prisma, service } = setup();
    prisma.creditCoupon.findUnique.mockResolvedValue(coupon());
    prisma.creditCouponRedemption.count.mockResolvedValue(0);
    prisma.creditCouponRedemption.create.mockResolvedValue({ id: 'red-1' });
    prisma.creditWallet.upsert.mockResolvedValue({ balance: 12 });

    const result = await service.redeem(venueUser, ' after2 ');

    expect(result).toEqual({ code: 'AFTER2', creditAmount: 2, balance: 12 });
    expect(prisma.creditCoupon.findUnique).toHaveBeenCalledWith({
      where: { code: 'AFTER2' },
    });
    expect(prisma.creditCouponRedemption.create).toHaveBeenCalledWith({
      data: {
        couponId: 'coupon-1',
        venueId: 'venue-1',
        venueNameSnapshot: 'Bar Central',
        venueCitySnapshot: 'São Paulo',
        creditAmount: 2,
      },
    });
    expect(prisma.creditWallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { balance: { increment: 2 } },
      }),
    );
    const order = [
      prisma.$queryRaw.mock.invocationCallOrder[0],
      prisma.creditCouponRedemption.count.mock.invocationCallOrder[0],
      prisma.creditCouponRedemption.create.mock.invocationCallOrder[0],
      prisma.creditWallet.upsert.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it.each([
    ['inexistente', {}, NotFoundException],
    ['inativo', { active: false }, BadRequestException],
    [
      'futuro',
      { startsAt: new Date('2999-01-01T00:00:00.000Z') },
      BadRequestException,
    ],
    [
      'expirado',
      { expiresAt: new Date('2000-01-01T00:00:00.000Z') },
      BadRequestException,
    ],
  ])('rejeita cupom %s', async (_label, overrides, errorType) => {
    const { prisma, service } = setup();
    prisma.creditCoupon.findUnique.mockResolvedValue(
      Object.keys(overrides).length ? coupon(overrides) : null,
    );

    await expect(service.redeem(venueUser, 'AFTER2')).rejects.toBeInstanceOf(
      errorType,
    );
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('rejeita limite total e limite por estabelecimento', async () => {
    const { prisma, service } = setup();
    prisma.creditCoupon.findUnique.mockResolvedValue(
      coupon({ maxRedemptions: 1, maxRedemptionsPerVenue: 2 }),
    );
    prisma.creditCouponRedemption.count.mockImplementation(async ({ where }) =>
      where.venueId ? 0 : 1,
    );

    await expect(service.redeem(venueUser, 'AFTER2')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.creditCoupon.findUnique.mockResolvedValue(
      coupon({ maxRedemptions: null, maxRedemptionsPerVenue: 1 }),
    );
    prisma.creditCouponRedemption.count.mockImplementation(async ({ where }) =>
      where.venueId ? 1 : 1,
    );
    await expect(service.redeem(venueUser, 'AFTER2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('usuário comum e admin não resgatam', async () => {
    const { prisma, service } = setup();
    await expect(
      service.redeem({ ...venueUser, role: 'USER' }, 'AFTER2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.redeem(adminUser, 'AFTER2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.venue.findUnique).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });

  it('requests concorrentes não geram crédito duplicado', async () => {
    const { prisma, service } = setup();
    let redemptions = 0;
    let chain: Promise<void> = Promise.resolve();
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => {
      const previous = chain;
      let release!: () => void;
      chain = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await fn(prisma);
      } finally {
        release();
      }
    });
    prisma.creditCoupon.findUnique.mockResolvedValue(coupon());
    prisma.creditCouponRedemption.count.mockImplementation(async () => redemptions);
    prisma.creditCouponRedemption.create.mockImplementation(async () => {
      redemptions += 1;
      return { id: `red-${redemptions}` };
    });
    prisma.creditWallet.upsert.mockImplementation(async () => ({
      balance: 10 + redemptions * 2,
    }));

    const [first, second] = await Promise.allSettled([
      service.redeem(venueUser, 'AFTER2'),
      service.redeem(venueUser, 'after2'),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
    expect(redemptions).toBe(1);
  });

  it('dois estabelecimentos não consomem o último resgate duas vezes', async () => {
    const { prisma, service } = setup();
    let redemptions = 0;
    let chain: Promise<void> = Promise.resolve();
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => {
      const previous = chain;
      let release!: () => void;
      chain = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await fn(prisma);
      } finally {
        release();
      }
    });
    prisma.creditCoupon.findUnique.mockResolvedValue(
      coupon({ maxRedemptions: 1, maxRedemptionsPerVenue: 1 }),
    );
    prisma.venue.findUnique.mockImplementation(async ({ where }) => {
      if (where.ownerUserId === 'owner-2') {
        return { id: 'venue-2', name: 'Outro Bar', city: 'Campinas' };
      }
      return { id: 'venue-1', name: 'Bar Central', city: 'São Paulo' };
    });
    prisma.creditCouponRedemption.count.mockImplementation(async () => redemptions);
    prisma.creditCouponRedemption.create.mockImplementation(async () => {
      redemptions += 1;
      return { id: `red-${redemptions}` };
    });
    prisma.creditWallet.upsert.mockResolvedValue({ balance: 2 });

    const other = { ...venueUser, userId: 'owner-2', email: 'outro@after.local' };
    const [first, second] = await Promise.allSettled([
      service.redeem(venueUser, 'AFTER2'),
      service.redeem(other, 'AFTER2'),
    ]);

    const fulfilled = [first, second].filter((item) => item.status === 'fulfilled');
    const rejected = [first, second].filter((item) => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledTimes(1);
    expect(redemptions).toBe(1);
  });

  it('desfaz o resgate se o crédito da carteira falhar', async () => {
    const { prisma, service } = setup();
    let redemptions = 0;
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => {
      const before = redemptions;
      try {
        return await fn(prisma);
      } catch (err) {
        redemptions = before;
        throw err;
      }
    });
    prisma.creditCoupon.findUnique.mockResolvedValue(coupon());
    prisma.creditCouponRedemption.count.mockResolvedValue(0);
    prisma.creditCouponRedemption.create.mockImplementation(async () => {
      redemptions += 1;
      return { id: 'red-1' };
    });
    prisma.creditWallet.upsert.mockRejectedValue(new Error('wallet down'));

    await expect(service.redeem(venueUser, 'AFTER2')).rejects.toThrow('wallet down');
    expect(redemptions).toBe(0);
  });

  it('detalhe traz histórico de resgate', async () => {
    const { prisma, service } = setup();
    prisma.creditCoupon.findUnique.mockResolvedValue({
      ...coupon(),
      redemptions: [
        {
          id: 'red-1',
          venueId: 'venue-1',
          creditAmount: 2,
          redeemedAt: new Date('2026-09-02T12:00:00.000Z'),
          venueNameSnapshot: 'Bar Central',
          venueCitySnapshot: 'São Paulo',
          venue: { id: 'venue-1', name: 'Bar Central', city: 'São Paulo' },
        },
      ],
    });

    const detail = await service.getById('coupon-1');

    expect(detail.redemptions).toEqual([
      expect.objectContaining({
        venueName: 'Bar Central',
        creditAmount: 2,
      }),
    ]);
  });

  it('mantém o nome do estabelecimento depois que a conta é excluída', async () => {
    const { prisma, service } = setup();
    prisma.creditCoupon.findUnique.mockResolvedValue({
      ...coupon(),
      redemptions: [
        {
          id: 'red-1',
          venueId: null,
          creditAmount: 2,
          redeemedAt: new Date('2026-09-02T12:00:00.000Z'),
          venueNameSnapshot: 'Bar Encerrado',
          venueCitySnapshot: 'Campinas',
          venue: null,
        },
      ],
    });

    const detail = await service.getById('coupon-1');

    expect(detail.redemptions).toEqual([
      expect.objectContaining({
        venueId: null,
        venueName: 'Bar Encerrado',
        city: 'Campinas',
        creditAmount: 2,
      }),
    ]);
  });
});
