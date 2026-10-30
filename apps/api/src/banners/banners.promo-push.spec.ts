import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BannersService } from './banners.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PromoPushPublisher } from '../promo-push/promo-push.publisher';
import { mockOwnedVenuePrisma } from './banners.test-helpers';

describe('BannersService promotional outbox', () => {
  function setup() {
    let inside = false;
    let debited = false;
    let rolledBack = false;
    const prisma: Record<string, unknown> = {
      venue: {
        findUnique: jest.fn(async () => ({
          id: 'venue-1',
          ownerUserId: 'owner-1',
          name: 'Bar Central',
          city: 'São Paulo',
          state: 'SP',
          ibgeCityId: null,
        })),
        update: jest.fn(async () => ({})),
      },
      banner: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(async ({ data }: { data: { status: string } }) => ({
          id: 'banner-1',
          status: data.status,
          schedules: [],
        })),
        create: jest.fn(async ({ data }: { data: { schedules: { create: { displayDate: Date; ibgeCityId: number | null }[] } } }) => ({
          id: 'banner-new',
          schedules: data.schedules.create.map((row, index) => ({
            id: index === 0 ? 'sch-today' : 'sch-future',
            displayDate: row.displayDate,
            ibgeCityId: row.ibgeCityId,
          })),
        })),
      },
      creditWallet: {
        findUnique: jest.fn(async () => ({ balance: 5 })),
        updateMany: jest.fn(async () => {
          debited = true;
          return { count: 1 };
        }),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn(),
      bannerPublicationIdempotency: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    mockOwnedVenuePrisma(prisma, { id: 'venue-1', ownerUserId: 'owner-1' });
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        inside = true;
        try {
          return await fn(prisma);
        } catch (error) {
          if (debited) rolledBack = true;
          throw error;
        } finally {
          inside = false;
        }
      },
    );
    const publisher: PromoPushPublisher = {
      resolveVenueCity: jest.fn(async () => 3550308),
      recordSchedules: jest.fn(async () => {
        expect(inside).toBe(false);
        expect(debited).toBe(true);
      }),
      skipBanner: jest.fn(async () => undefined),
    };
    const notifications = {
      notifyFavoriteFollowers: jest.fn(async () => undefined),
    } as unknown as NotificationsService;
    const service = new BannersService(
      prisma as never,
      { get: () => '1' } as unknown as ConfigService,
      notifications,
      publisher,
    );
    return { prisma, publisher, notifications, service, rolledBack: () => rolledBack };
  }

  it('grava o outbox depois do commit do débito e não chama o FCM', async () => {
    const { prisma, publisher, notifications, service } = setup();
    await service.create(
      'owner-1',
      'https://cdn.example/a.jpg',
      ['2026-10-20', '2026-10-22'],
      'Chopp',
      'Noite',
      null,
    );
    expect(prisma.creditWallet.updateMany).toHaveBeenCalledTimes(1);
    expect(publisher.recordSchedules).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        bannerId: 'banner-new',
        schedules: [
          expect.objectContaining({ id: 'sch-today', ibgeCityId: 3550308 }),
          expect.objectContaining({ id: 'sch-future', ibgeCityId: 3550308 }),
        ],
      }),
    );
    expect(notifications.notifyFavoriteFollowers).toHaveBeenCalled();
    expect(prisma.venue.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ibgeCityId: 3550308 } }),
    );
  });

  it('falha do outbox não desfaz o débito nem a publicação', async () => {
    const { publisher, service, rolledBack, prisma, notifications } = setup();
    (publisher.recordSchedules as jest.Mock).mockRejectedValue(new Error('outbox'));
    const banner = await service.create(
      'owner-1',
      'https://cdn.example/a.jpg',
      ['2026-10-20'],
      'Título',
      'Texto',
    );
    expect(banner).toEqual(expect.objectContaining({ id: 'banner-new' }));
    expect(rolledBack()).toBe(false);
    expect(prisma.creditWallet.updateMany).toHaveBeenCalledTimes(1);
    expect(publisher.recordSchedules).toHaveBeenCalledTimes(2);
    expect(notifications.notifyFavoriteFollowers).toHaveBeenCalled();
  });

  it('falha do IBGE não grava município e não apaga um id já confirmado', async () => {
    const { prisma, publisher, service } = setup();
    (publisher.resolveVenueCity as jest.Mock).mockRejectedValueOnce(new Error('ibge down'));
    await service.create('owner-1', 'https://cdn.example/a.jpg', ['2026-10-20'], 'Título', 'Texto');
    expect(prisma.venue.update).not.toHaveBeenCalled();
    const created = prisma.banner.create.mock.calls[0][0].data;
    expect(created.schedules.create[0].ibgeCityId).toBeNull();

    prisma.venue.findUnique.mockResolvedValue({
      id: 'venue-1',
      ownerUserId: 'owner-1',
      name: 'Bar Central',
      city: 'São Paulo',
      state: 'SP',
      ibgeCityId: 3550308,
      owner: { email: 'bar@after.local', name: 'Bar Central' },
    });
    (publisher.resolveVenueCity as jest.Mock).mockResolvedValueOnce(null);
    await service.create('owner-1', 'https://cdn.example/a.jpg', ['2026-10-20'], 'Título', 'Texto');
    expect(prisma.venue.update).not.toHaveBeenCalled();
    const kept = prisma.banner.create.mock.calls[1][0].data;
    expect(kept.schedules.create[0].ibgeCityId).toBe(3550308);
  });

  it('saldo insuficiente não cria publicação', async () => {
    const { prisma, publisher, service } = setup();
    prisma.creditWallet.findUnique.mockResolvedValueOnce({ balance: 0 });
    await expect(
      service.create('owner-1', 'https://cdn.example/a.jpg', ['2026-10-20'], 'Título', 'Texto'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(publisher.recordSchedules).not.toHaveBeenCalled();
  });

  it('cancelar não devolve crédito e marca o evento', async () => {
    const { prisma, publisher, service } = setup();
    prisma.banner.findFirst.mockResolvedValue({
      id: 'banner-1',
      venueId: 'venue-1',
      status: 'ACTIVE',
      schedules: [],
    });
    const result = await service.cancel('owner-1', 'banner-1');
    expect(result.status).toBe('CANCELLED');
    expect(prisma.creditWallet.updateMany).not.toHaveBeenCalled();
    expect(publisher.skipBanner).toHaveBeenCalledWith('banner-1');
  });
});
