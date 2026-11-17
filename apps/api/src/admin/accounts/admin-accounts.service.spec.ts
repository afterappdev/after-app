import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from '../../users/users.service';
import { AdminAccountsService } from './admin-accounts.service';

describe('AdminAccountsService.list', () => {
  it('devolve foto, faixa etária e categoria do local', async () => {
    const createdAt = new Date('2026-09-01T12:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'u1',
        name: 'Ana',
        email: 'ana@after.local',
        role: Role.USER,
        state: 'SP',
        city: 'Campinas',
        createdAt,
        avatarUrl: 'https://cdn.example/ana.jpg',
        ageBand: 'AGE_19_35',
        ownedVenues: [],
      },
      {
        id: 'u2',
        name: 'Dono',
        email: 'bar@after.local',
        role: Role.VENUE,
        state: 'PR',
        city: 'Curitiba',
        createdAt,
        avatarUrl: null,
        ageBand: null,
        ownedVenues: [
          {
            id: 'v1',
            name: 'Bar Central',
            category: '  🍻 Bares e Botecos  ',
            logoUrl: 'https://cdn.example/logo.jpg',
            contacts: { phone: ' 41999990000 ' },
          },
        ],
      },
    ]);
    const prisma = {
      user: { count: jest.fn().mockResolvedValue(2), findMany },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    const service = new AdminAccountsService(prisma as never, {} as never);

    const result = await service.list({});

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'u1',
        avatarUrl: 'https://cdn.example/ana.jpg',
        ageBand: 'AGE_19_35',
        venueCategory: null,
        venueLogoUrl: null,
        contactPhone: null,
      }),
      expect.objectContaining({
        id: 'u2',
        venueName: 'Bar Central',
        venueCategory: '🍻 Bares e Botecos',
        venueLogoUrl: 'https://cdn.example/logo.jpg',
        contactPhone: '41999990000',
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          avatarUrl: true,
          ageBand: true,
          ownedVenues: expect.objectContaining({
            select: expect.objectContaining({
              category: true,
              logoUrl: true,
              contacts: true,
            }),
          }),
        }),
      }),
    );
  });
  it('com role VENUE lista um item por estabelecimento', async () => {
    const createdAt = new Date('2026-09-01T12:00:00.000Z');
    const venueFindMany = jest.fn().mockResolvedValue([
      {
        id: 'v1',
        name: 'Bar Central',
        category: 'Bares',
        logoUrl: null,
        contacts: null,
        city: 'São Paulo',
        state: 'SP',
        createdAt,
        owner: {
          id: 'u-venue',
          name: 'Dono',
          email: 'bar@after.local',
          role: Role.VENUE,
          avatarUrl: null,
          createdAt,
        },
      },
      {
        id: 'v2',
        name: 'Picanha na Chapa',
        category: 'Churrascarias',
        logoUrl: null,
        contacts: null,
        city: 'Ribeirão Preto',
        state: 'SP',
        createdAt,
        owner: {
          id: 'u-venue',
          name: 'Dono',
          email: 'bar@after.local',
          role: Role.VENUE,
          avatarUrl: null,
          createdAt,
        },
      },
    ]);
    const prisma = {
      user: { count: jest.fn(), findMany: jest.fn() },
      venue: {
        count: jest.fn().mockResolvedValue(2),
        findMany: venueFindMany,
      },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    const service = new AdminAccountsService(prisma as never, {} as never);

    const result = await service.list({ role: 'VENUE' });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.venueName)).toEqual([
      'Bar Central',
      'Picanha na Chapa',
    ]);
    expect(result.items.every((item) => item.id === 'u-venue')).toBe(true);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(venueFindMany).toHaveBeenCalled();
  });
});

describe('AdminAccountsService.remove', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
  };
  const users = {
    purgeAccountPermanently: jest.fn(),
  };
  let service: AdminAccountsService;

  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    users.purgeAccountPermanently.mockReset();
    users.purgeAccountPermanently.mockResolvedValue({
      ok: true,
      outcome: 'hard_deleted',
    });
    service = new AdminAccountsService(prisma as never, users as never);
  });

  it('admin exclui USER com purge imediato', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u-user', role: Role.USER });

    await expect(service.remove('u-user')).resolves.toEqual({
      success: true,
      outcome: 'hard_deleted',
    });
    expect(users.purgeAccountPermanently).toHaveBeenCalledWith('u-user', {
      strategy: 'hard',
      auditSource: 'admin',
    });
  });

  it('admin exclui VENUE com purge imediato', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-venue',
      role: Role.VENUE,
    });

    await expect(service.remove('u-venue')).resolves.toEqual({
      success: true,
      outcome: 'hard_deleted',
    });
    expect(users.purgeAccountPermanently).toHaveBeenCalledWith('u-venue', {
      strategy: 'hard',
      auditSource: 'admin',
    });
  });

  it('conta inexistente → 404 e não chama exclusão', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(users.purgeAccountPermanently).not.toHaveBeenCalled();
  });

  it('tentativa de excluir ADMIN é bloqueada', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-admin',
      role: Role.ADMIN,
    });

    await expect(service.remove('u-admin')).rejects.toMatchObject({
      message: 'Conta administrativa não pode ser excluída.',
    });
    await expect(service.remove('u-admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(users.purgeAccountPermanently).not.toHaveBeenCalled();
  });

  it('remove delega ao purge orquestrado do UsersService', async () => {
    const purge = jest.fn().mockResolvedValue({
      ok: true,
      outcome: 'hard_deleted',
    });
    const adminService = new AdminAccountsService(
      { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u-user', role: Role.USER }) } } as never,
      { purgeAccountPermanently: purge } as never,
    );
    await expect(adminService.remove('u-user')).resolves.toEqual({
      success: true,
      outcome: 'hard_deleted',
    });
    expect(purge).toHaveBeenCalledWith('u-user', {
      strategy: 'hard',
      auditSource: 'admin',
    });
  });
});
