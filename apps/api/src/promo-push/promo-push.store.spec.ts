import { PrismaService } from '../prisma/prisma.service';
import { promoAudienceWhere } from './promo-push.audience';
import { PrismaPromoPushStore } from './promo-push.store';

describe('PrismaPromoPushStore', () => {
  it('não consulta tokens nem eventos do Admin', async () => {
    const adminDeviceToken = { findMany: jest.fn() };
    const adminPushEvent = { findMany: jest.fn() };
    const userFindMany = jest.fn(async () => []);
    const prisma = {
      adminDeviceToken,
      adminPushEvent,
      user: { findMany: userFindMany },
      promoPushEvent: {},
      promoPushDelivery: {},
      devicePushToken: {},
    };
    const store = new PrismaPromoPushStore(prisma as unknown as PrismaService);
    await store.loadAudience(
      {
        id: 'evt-1',
        bannerId: 'banner-1',
        venueId: 'venue-1',
        scheduleId: 'sch-1',
        ibgeCityId: 3550308,
        contentKind: null,
        venueName: 'Bar',
        bannerStatus: 'ACTIVE',
        venueHidden: false,
        scheduleTier: 'VIP',
        vipCreditEntryId: 'proof-1',
        attempts: 1,
        availableAt: new Date('2026-10-20T03:00:00.000Z'),
        expiresAt: new Date('2026-10-21T03:00:00.000Z'),
      },
      new Date('2026-10-20T09:00:00.000Z'),
      null,
    );
    expect(adminDeviceToken.findMany).not.toHaveBeenCalled();
    expect(adminPushEvent.findMany).not.toHaveBeenCalled();
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: promoAudienceWhere({
          ibgeCityId: 3550308,
          freshAfter: new Date('2026-10-20T09:00:00.000Z'),
          venueId: 'venue-1',
          allowlist: null,
        }),
      }),
    );
  });

  it('o claim só atualiza evento livre e vencido de lock', async () => {
    const updateMany = jest.fn(
      async (_input: { where: Record<string, unknown> }) => ({ count: 1 }),
    );
    const prisma = {
      promoPushEvent: { updateMany },
    };
    const store = new PrismaPromoPushStore(prisma as unknown as PrismaService);
    const now = new Date('2026-10-20T15:00:00.000Z');
    await store.claim('evt-1', 'worker-a', now, 1000);
    const where = updateMany.mock.calls[0]?.[0].where;
    if (!where) throw new Error('claim where missing');
    expect(where.id).toBe('evt-1');
    expect(where.status).toEqual({ in: ['PENDING', 'PROCESSING'] });
    expect(where.availableAt).toEqual({ lte: now });
    expect(where.expiresAt).toEqual({ gt: now });
    expect(where.OR).toEqual([
      { lockedUntil: null },
      { lockedUntil: { lt: now } },
    ]);
  });
});
