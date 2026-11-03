import { AccountLifecycleStatus } from '@prisma/client';
import { NotificationsService, VISIBLE_INBOX_LIMIT } from './notifications.service';

function mockPrisma() {
  const notification = {
    findMany: jest.fn(),
    count: jest.fn(),
    createMany: jest.fn(),
    updateMany: jest.fn(),
  };
  const favorite = { findMany: jest.fn() };
  const venue = { findUnique: jest.fn() };
  return {
    prisma: { notification, favorite, venue },
    notification,
    favorite,
    venue,
  };
}

const visibleVenue = {
  moderationHiddenAt: null,
  ownerArchivedAt: null,
  owner: { accountStatus: AccountLifecycleStatus.ACTIVE },
};

describe('NotificationsService', () => {
  it('lista no máximo 10 notificações visíveis ordenadas', async () => {
    const { prisma, notification } = mockPrisma();
    notification.findMany.mockResolvedValue([]);
    const service = new NotificationsService(prisma as never);
    await service.list('user-1');
    expect(notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: VISIBLE_INBOX_LIMIT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });

  it('contador de não lidas considera só as 10 visíveis', async () => {
    const { prisma, notification } = mockPrisma();
    notification.findMany.mockResolvedValue([
      { readAt: null },
      { readAt: new Date() },
      { readAt: null },
    ]);
    const service = new NotificationsService(prisma as never);
    await expect(service.unreadCount('user-1')).resolves.toBe(2);
    expect(notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: VISIBLE_INBOX_LIMIT }),
    );
  });

  it('notifyFavoriteFollowers grava só para favoritos com venue visível', async () => {
    const { prisma, venue, favorite, notification } = mockPrisma();
    venue.findUnique.mockResolvedValue(visibleVenue);
    favorite.findMany.mockResolvedValue([{ userId: 'fan-1' }]);
    notification.createMany.mockResolvedValue({ count: 1 });
    const service = new NotificationsService(prisma as never);
    await service.notifyFavoriteFollowers({
      venueId: 'venue-1',
      venueName: 'Bar',
      bannerId: 'banner-1',
      promoTitle: 'Promo',
    });
    expect(notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'fan-1',
          venueId: 'venue-1',
          bannerId: 'banner-1',
          title: 'Bar publicou uma promoção',
        }),
      ],
    });
  });

  it('notifyFavoriteFollowers ignora venue arquivado', async () => {
    const { prisma, venue, favorite, notification } = mockPrisma();
    venue.findUnique.mockResolvedValue({
      ...visibleVenue,
      ownerArchivedAt: new Date(),
    });
    const service = new NotificationsService(prisma as never);
    await service.notifyFavoriteFollowers({
      venueId: 'venue-1',
      venueName: 'Bar',
      bannerId: 'banner-1',
    });
    expect(favorite.findMany).not.toHaveBeenCalled();
    expect(notification.createMany).not.toHaveBeenCalled();
  });

  it('persistVipPromoInbox usa promoPushEventId e skipDuplicates', async () => {
    const { prisma, venue, notification } = mockPrisma();
    venue.findUnique.mockResolvedValue(visibleVenue);
    notification.createMany.mockResolvedValue({ count: 2 });
    const service = new NotificationsService(prisma as never);
    await service.persistVipPromoInbox({
      promoPushEventId: 'evt-1',
      venueId: 'venue-1',
      bannerId: 'banner-1',
      venueName: 'Bar Central',
      contentKind: 'PROMOTION',
      bannerTitle: 'VIP hoje',
      bannerDescription: 'Detalhes',
      userIds: ['u-1', 'u-1', 'u-2'],
    });
    expect(notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'u-1',
          promoPushEventId: 'evt-1',
          title: 'Bar Central publicou VIP hoje',
        }),
        expect.objectContaining({ userId: 'u-2', promoPushEventId: 'evt-1' }),
      ],
      skipDuplicates: true,
    });
  });

  it('persistVipPromoInbox não grava quando venue não é público', async () => {
    const { prisma, venue, notification } = mockPrisma();
    venue.findUnique.mockResolvedValue({
      moderationHiddenAt: new Date(),
      ownerArchivedAt: null,
      owner: { accountStatus: AccountLifecycleStatus.ACTIVE },
    });
    const service = new NotificationsService(prisma as never);
    await service.persistVipPromoInbox({
      promoPushEventId: 'evt-1',
      venueId: 'venue-1',
      bannerId: 'banner-1',
      venueName: 'Bar',
      contentKind: null,
      bannerTitle: null,
      bannerDescription: null,
      userIds: ['u-1'],
    });
    expect(notification.createMany).not.toHaveBeenCalled();
  });
});
