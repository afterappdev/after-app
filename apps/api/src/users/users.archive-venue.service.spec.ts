import { ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { AccountLifecycleService } from './account-lifecycle.service';
import { MediaCleanupService } from '../uploads/media-cleanup.service';
import { AppleAuthTokensService } from '../auth/apple-auth-tokens.service';

describe('UsersService.archiveOwnedVenue', () => {
  const userId = 'owner-1';

  function createService() {
    const prisma = {
      venue: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<void>) =>
        fn(prisma),
      ),
    };
    const service = new UsersService(
      prisma as never,
      {} as MediaCleanupService,
      {} as AppleAuthTokensService,
      {} as AccountLifecycleService,
    );
    return { service, prisma };
  }

  it('arquiva venue do proprietário e reponta activeVenueId', async () => {
    const { service, prisma } = createService();
    prisma.venue.findFirst.mockResolvedValueOnce({
      id: 'v1',
      name: 'Bar A',
      moderationHiddenAt: null,
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({ activeVenueId: 'v1' })
      .mockResolvedValueOnce({
        id: userId,
        activeVenueId: 'v2',
        ownedVenues: [
          {
            id: 'v2',
            name: 'Bar B',
            city: 'Campinas',
            state: 'SP',
            logoUrl: null,
          },
        ],
      });
    prisma.venue.findFirst.mockResolvedValueOnce({ id: 'v2' });

    const result = await service.archiveOwnedVenue(userId, 'v1');

    expect(prisma.venue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v1' },
        data: expect.objectContaining({ ownerArchivedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { activeVenueId: 'v2' },
      }),
    );
    expect(result.activeVenueId).toBe('v2');
    expect(result.venues).toHaveLength(1);
    expect(result.archivedVenueName).toBe('Bar A');
  });

  it('rejeita venue de terceiro ou já arquivado', async () => {
    const { service, prisma } = createService();
    prisma.venue.findFirst.mockResolvedValue(null);

    await expect(
      service.archiveOwnedVenue(userId, 'foreign'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('último venue deixa activeVenueId nulo', async () => {
    const { service, prisma } = createService();
    prisma.venue.findFirst.mockResolvedValueOnce({
      id: 'only',
      name: 'Único',
      moderationHiddenAt: null,
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({ activeVenueId: 'only' })
      .mockResolvedValueOnce({
        id: userId,
        activeVenueId: null,
        ownedVenues: [],
      });
    prisma.venue.findFirst.mockResolvedValueOnce(null);

    const result = await service.archiveOwnedVenue(userId, 'only');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { activeVenueId: null } }),
    );
    expect(result.venues).toHaveLength(0);
    expect(result.activeVenueId).toBeNull();
  });
});
