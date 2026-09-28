import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BannersService } from './banners.service';
import { NotificationsService } from '../notifications/notifications.service';

function setup() {
  const prisma = {
    venue: { findUnique: jest.fn() },
    banner: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    creditWallet: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const config = {
    get: jest.fn().mockReturnValue('1'),
  } as unknown as ConfigService;
  const notifications = {
    notifyFavoriteFollowers: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;
  const service = new BannersService(prisma as never, config, notifications);
  prisma.venue.findUnique.mockResolvedValue({
    id: 'venue-1',
    ownerUserId: 'owner-1',
    name: 'Bar',
    city: 'São Paulo',
  });
  return { prisma, service };
}

describe('BannersService cancel', () => {
  it('o proprietário cancela sem devolver créditos', async () => {
    const { prisma, service } = setup();
    prisma.banner.findUnique.mockResolvedValue({
      id: 'banner-1',
      venueId: 'venue-1',
      status: 'ACTIVE',
      creditsCost: 2,
      schedules: [],
    });
    prisma.banner.update.mockImplementation(async ({ data }) => ({
      id: 'banner-1',
      venueId: 'venue-1',
      status: data.status,
      creditsCost: 2,
      schedules: [],
    }));

    const result = await service.cancel('owner-1', 'banner-1');

    expect(result.status).toBe('CANCELLED');
    expect(prisma.banner.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'banner-1' },
        data: { status: 'CANCELLED' },
      }),
    );
    expect(prisma.creditWallet.updateMany).not.toHaveBeenCalled();
    expect(prisma.creditWallet.update).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cancelar de novo é idempotente e continua sem crédito', async () => {
    const { prisma, service } = setup();
    prisma.banner.findUnique.mockResolvedValue({
      id: 'banner-1',
      venueId: 'venue-1',
      status: 'CANCELLED',
      schedules: [],
    });

    const result = await service.cancel('owner-1', 'banner-1');

    expect(result.status).toBe('CANCELLED');
    expect(prisma.banner.update).not.toHaveBeenCalled();
    expect(prisma.creditWallet.updateMany).not.toHaveBeenCalled();
  });

  it('outro estabelecimento não cancela', async () => {
    const { prisma, service } = setup();
    prisma.venue.findUnique.mockImplementation(async ({ where }) => {
      if (where.ownerUserId === 'other') {
        return { id: 'venue-2', ownerUserId: 'other', city: 'São Paulo' };
      }
      return null;
    });
    prisma.banner.findUnique.mockResolvedValue({
      id: 'banner-1',
      venueId: 'venue-1',
      status: 'ACTIVE',
      schedules: [],
    });

    await expect(service.cancel('other', 'banner-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.banner.update).not.toHaveBeenCalled();
    expect(prisma.creditWallet.updateMany).not.toHaveBeenCalled();
  });

  it('usuário comum não cancela', async () => {
    const { prisma, service } = setup();
    prisma.venue.findUnique.mockResolvedValue(null);

    await expect(service.cancel('user-1', 'banner-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.banner.update).not.toHaveBeenCalled();
    expect(prisma.creditWallet.updateMany).not.toHaveBeenCalled();
  });

  it('histórico do estabelecimento inclui promoções canceladas', async () => {
    const { prisma, service } = setup();
    prisma.banner.findMany.mockResolvedValue([
      { id: 'banner-1', status: 'CANCELLED', schedules: [] },
    ]);

    const rows = await service.history('owner-1');

    expect(rows).toEqual([
      expect.objectContaining({ id: 'banner-1', status: 'CANCELLED' }),
    ]);
    expect(prisma.banner.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { venueId: 'venue-1' },
      }),
    );
    expect(prisma.banner.findMany.mock.calls[0][0].where.status).toBeUndefined();
  });

  it('publicar continua debitando a carteira uma vez', async () => {
    const { prisma, service } = setup();
    prisma.creditWallet.findUnique.mockResolvedValue({ balance: 5 });
    prisma.creditWallet.updateMany.mockResolvedValue({ count: 1 });
    prisma.banner.create.mockResolvedValue({ id: 'banner-2', schedules: [] });

    await service.create('owner-1', 'https://cdn.example/a.jpg', ['2026-10-01'], 'Promo', 'Texto');

    expect(prisma.creditWallet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { venueId: 'venue-1', balance: { gte: 1 } },
        data: { balance: { decrement: 1 } },
      }),
    );
    expect(prisma.creditWallet.update).not.toHaveBeenCalled();
    expect(prisma.creditWallet.upsert).not.toHaveBeenCalled();
  });
});
