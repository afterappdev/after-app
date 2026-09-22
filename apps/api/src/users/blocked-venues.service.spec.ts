import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';

function createPrisma() {
  return {
    venue: { findUnique: jest.fn() },
    userVenueBlock: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    favorite: { deleteMany: jest.fn() },
  };
}

const user = {
  userId: 'user-1',
  email: 'user@after.local',
  role: 'USER' as const,
};

describe('UsersService blocked venues', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new UsersService(prisma as never, {} as never, {} as never);
  });

  it('USER bloqueia VENUE e remove favorito', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      id: 'venue-1',
      ownerUserId: 'owner-1',
    });
    prisma.userVenueBlock.upsert.mockResolvedValue({
      id: 'block-1',
      venueId: 'venue-1',
      createdAt: new Date(),
      venue: { id: 'venue-1', name: 'Bar Central' },
    });
    prisma.favorite.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.blockVenue(user, 'venue-1');
    expect(result.venueId).toBe('venue-1');
    expect(prisma.favorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', venueId: 'venue-1' },
    });
  });

  it('bloqueio duplicado não falha (upsert)', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      id: 'venue-1',
      ownerUserId: 'owner-1',
    });
    prisma.userVenueBlock.upsert.mockResolvedValue({
      id: 'block-1',
      venueId: 'venue-1',
      createdAt: new Date(),
      venue: { id: 'venue-1', name: 'Bar' },
    });
    prisma.favorite.deleteMany.mockResolvedValue({ count: 0 });

    await service.blockVenue(user, 'venue-1');
    await service.blockVenue(user, 'venue-1');
    expect(prisma.userVenueBlock.upsert).toHaveBeenCalledTimes(2);
  });

  it('USER desbloqueia VENUE', async () => {
    prisma.userVenueBlock.deleteMany.mockResolvedValue({ count: 1 });
    await expect(service.unblockVenue(user, 'venue-1')).resolves.toEqual({
      ok: true,
    });
  });

  it('VENUE não usa o fluxo de bloqueio', async () => {
    await expect(
      service.blockVenue({ ...user, role: 'VENUE' }, 'venue-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('não bloqueia estabelecimento inexistente', async () => {
    prisma.venue.findUnique.mockResolvedValue(null);
    await expect(service.blockVenue(user, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
