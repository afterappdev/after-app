import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BannersService } from './banners.service';
import { NotificationsService } from '../notifications/notifications.service';
import { quotePublication } from './banner-quote';
import { mockActiveUserPrisma } from './banners.test-helpers';

describe('quotePublication', () => {
  it('sexta comum, sábado VIP e domingo comum', () => {
    expect(
      quotePublication({
        dates: ['2026-10-23', '2026-10-25'],
        vipDates: ['2026-10-24'],
        creditPerDisplayDay: 1,
      }),
    ).toEqual({
      days: [
        { date: '2026-10-23', tier: 'COMMON' },
        { date: '2026-10-25', tier: 'COMMON' },
        { date: '2026-10-24', tier: 'VIP' },
      ],
      commonCredits: 2,
      vipCredits: 1,
    });
  });

  it('duas datas VIP não consomem crédito comum', () => {
    expect(
      quotePublication({
        dates: [],
        vipDates: ['2026-10-24', '2026-10-25'],
        creditPerDisplayDay: 1,
      }),
    ).toMatchObject({ commonCredits: 0, vipCredits: 2 });
  });

  it('rejeita data repetida e modalidade contraditória', () => {
    expect(() =>
      quotePublication({
        dates: ['2026-10-24', '2026-10-24'],
        creditPerDisplayDay: 1,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      quotePublication({
        dates: ['2026-10-24'],
        vipDates: ['2026-10-24'],
        creditPerDisplayDay: 1,
      }),
    ).toThrow(BadRequestException);
  });
});

describe('BannersService VIP', () => {
  const VIP_A = '2099-06-10';
  const VIP_B = '2099-06-11';
  const COMMON_A = '2099-06-09';
  const COMMON_B = '2099-06-12';

  function vipPublications(...dates: string[]) {
    return dates.map((date) => ({
      date,
      pushTiming: 'SLOT_11' as const,
    }));
  }

  function setup(balance: { balance: number; vipBalance: number }) {
    const wallet = { ...balance };
    const entries: { operationKey: string }[] = [];
    let created = false;
    let scheduleSequence = 0;
    const prisma: Record<string, unknown> = {
      venue: {
        findUnique: jest.fn(async () => ({
          id: 'venue-1',
          ownerUserId: 'owner-1',
          name: 'Bar',
          city: 'São Paulo',
          state: 'SP',
          ibgeCityId: 3550308,
        })),
        update: jest.fn(),
      },
      creditWallet: {
        findUnique: jest.fn(async () => ({ ...wallet })),
        updateMany: jest.fn(async (args: {
          where: { balance?: { gte: number }; vipBalance?: { gte: number } };
          data: {
            balance?: { decrement: number };
            vipBalance?: { decrement: number };
          };
        }) => {
          const common = args.data.balance?.decrement ?? 0;
          const vip = args.data.vipBalance?.decrement ?? 0;
          if (wallet.balance < common || wallet.vipBalance < vip) return { count: 0 };
          wallet.balance -= common;
          wallet.vipBalance -= vip;
          return { count: 1 };
        }),
      },
      banner: {
        create: jest.fn(async ({ data }: { data: { schedules: { create: { tier: string; displayDate: Date }[] } } }) => {
          created = true;
          return {
            id: 'banner-1',
            schedules: data.schedules.create.map((row) => ({
              id: `sch-${scheduleSequence++}`,
              displayDate: row.displayDate,
              ibgeCityId: 3550308,
              tier: row.tier,
              vipCreditEntryId: null,
            })),
          };
        }),
      },
      bannerSchedule: {
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: { vipCreditEntryId: string } }) => ({
          id: where.id,
          vipCreditEntryId: data.vipCreditEntryId,
        })),
      },
      vipCreditEntry: {
        create: jest.fn(async ({ data }: { data: { operationKey: string } }) => {
          if (entries.some((item) => item.operationKey === data.operationKey)) {
            throw new Error('duplicate consume');
          }
          entries.push(data);
          return { id: `entry-${entries.length}`, ...data };
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const snapshot = { ...wallet };
        const before = entries.length;
        try {
          return await fn(prisma);
        } catch (error) {
          wallet.balance = snapshot.balance;
          wallet.vipBalance = snapshot.vipBalance;
          entries.splice(before);
          created = false;
          throw error;
        }
      }),
    };
    mockActiveUserPrisma(prisma);
    const idempotency = new Map<
      string,
      {
        requestHash: string;
        status: 'PROCESSING' | 'COMPLETED';
        bannerId: string | null;
      }
    >();
    prisma.bannerPublicationIdempotency = {
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            venueId: string;
            idempotencyKey: string;
            requestHash: string;
            status: 'PROCESSING';
          };
        }) => {
          const key = `${data.venueId}:${data.idempotencyKey}`;
          if (idempotency.has(key)) {
            const err = new Error('unique') as Error & { code: string };
            err.code = 'P2002';
            throw err;
          }
          idempotency.set(key, {
            requestHash: data.requestHash,
            status: 'PROCESSING',
            bannerId: null,
          });
        },
      ),
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: {
            venueId_idempotencyKey: { venueId: string; idempotencyKey: string };
          };
        }) => {
          const key = `${where.venueId_idempotencyKey.venueId}:${where.venueId_idempotencyKey.idempotencyKey}`;
          return idempotency.get(key) ?? null;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: {
            venueId_idempotencyKey: { venueId: string; idempotencyKey: string };
          };
          data: { status: 'COMPLETED'; bannerId: string };
        }) => {
          const key = `${where.venueId_idempotencyKey.venueId}:${where.venueId_idempotencyKey.idempotencyKey}`;
          const row = idempotency.get(key);
          if (row) {
            row.status = data.status;
            row.bannerId = data.bannerId;
          }
        },
      ),
    };
    prisma.banner = {
      ...(prisma.banner as object),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        schedules: [],
      })),
    };
    const service = new BannersService(
      prisma as never,
      { get: () => '1' } as unknown as ConfigService,
      { notifyFavoriteFollowers: jest.fn() } as unknown as NotificationsService,
    );
    return { prisma, service, wallet, entries, wasCreated: () => created };
  }

  it('publicação mista debita os dois saldos na mesma transação', async () => {
    const { prisma, service, wallet, entries } = setup({ balance: 2, vipBalance: 1 });
    await service.create(
      'owner-1',
      'https://cdn.example/a.jpg',
      [COMMON_A, COMMON_B],
      'Fim de semana',
      'Texto',
      null,
      [VIP_A],
      undefined,
      vipPublications(VIP_A),
    );
    expect(wallet).toEqual({ balance: 0, vipBalance: 0 });
    expect(entries.map((item) => item.operationKey)).toEqual(['vip-consume:sch-2']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('falta de VIP não debita o saldo comum', async () => {
    const { prisma, service, wallet, wasCreated } = setup({ balance: 5, vipBalance: 0 });
    await expect(
      service.create(
        'owner-1',
        'https://cdn.example/a.jpg',
        [COMMON_A],
        'Título',
        'Texto',
        null,
        [VIP_A],
        undefined,
        vipPublications(VIP_A),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(wallet).toEqual({ balance: 5, vipBalance: 0 });
    expect(wasCreated()).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('corrida com saldo para uma publicação não deixa débito parcial', async () => {
    const state = setup({ balance: 1, vipBalance: 1 });
    state.prisma.creditWallet.updateMany.mockImplementationOnce(async () => ({ count: 0 }));
    await expect(
      state.service.create(
        'owner-1',
        'https://cdn.example/a.jpg',
        [],
        'Título',
        'Texto',
        null,
        [VIP_A],
        undefined,
        vipPublications(VIP_A),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.wallet).toEqual({ balance: 1, vipBalance: 1 });
    expect(state.wasCreated()).toBe(false);
  });

  it('falha ao gravar o banner devolve os dois saldos', async () => {
    const { prisma, service, wallet } = setup({ balance: 2, vipBalance: 1 });
    prisma.banner.create.mockRejectedValueOnce(new Error('disk'));
    await expect(
      service.create(
        'owner-1',
        'https://cdn.example/a.jpg',
        [COMMON_A],
        'Título',
        'Texto',
        null,
        [VIP_A],
        undefined,
        vipPublications(VIP_A),
      ),
    ).rejects.toThrow('disk');
    expect(wallet).toEqual({ balance: 2, vipBalance: 1 });
  });

  it('VIP sem município IBGE é rejeitado antes do débito', async () => {
    const { prisma, service, wallet, wasCreated } = setup({
      balance: 0,
      vipBalance: 2,
    });
    prisma.venue.findUnique.mockResolvedValueOnce({
      id: 'venue-1',
      ownerUserId: 'owner-1',
      name: 'Bar',
      city: 'Cidade Ambígua',
      state: 'SP',
      ibgeCityId: null,
    });
    await expect(
      service.create(
        'owner-1',
        'https://cdn.example/a.jpg',
        [],
        'Título',
        'Texto',
        null,
        [VIP_A],
        undefined,
        vipPublications(VIP_A),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(wallet.vipBalance).toBe(2);
    expect(wasCreated()).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('republicar a mesma data VIP consome outro crédito', async () => {
    const { service, wallet, entries } = setup({ balance: 0, vipBalance: 2 });
    await service.create(
      'owner-1',
      'https://cdn.example/a.jpg',
      [],
      'Título',
      'Texto',
      null,
      [VIP_A],
      undefined,
      vipPublications(VIP_A),
    );
    await service.create(
      'owner-1',
      'https://cdn.example/b.jpg',
      [],
      'Outra',
      'Texto',
      null,
      [VIP_A],
      undefined,
      vipPublications(VIP_A),
    );
    expect(wallet.vipBalance).toBe(0);
    expect(entries).toHaveLength(2);
  });

  it('cliente legado com só vipDates publica sem vipPushTiming', async () => {
    const { service, wallet, prisma } = setup({ balance: 0, vipBalance: 1 });
    let capturedTiming: string | null | undefined = 'unset';
    (prisma.banner as { create: jest.Mock }).create.mockImplementationOnce(
      async ({ data }: { data: { schedules: { create: { tier: string; vipPushTiming?: string | null }[] } } }) => ({
        id: 'banner-legacy',
        schedules: data.schedules.create.map((row, index) => {
          capturedTiming = row.vipPushTiming ?? null;
          return {
            id: `sch-leg-${index}`,
            displayDate: new Date('2099-06-10T00:00:00.000Z'),
            ibgeCityId: 3550308,
            tier: row.tier,
            vipCreditEntryId: null,
            vipPushTiming: row.vipPushTiming ?? null,
          };
        }),
      }),
    );
    await service.create(
      'owner-1',
      'https://cdn.example/legacy.jpg',
      [],
      'Legado',
      'Texto',
      null,
      [VIP_A],
    );
    expect(wallet.vipBalance).toBe(0);
    expect(capturedTiming).toBeNull();
  });

  it('vipPublications multidata com horários distintos', async () => {
    const { service, wallet, prisma } = setup({ balance: 0, vipBalance: 2 });
    const captured: { date: string; timing: string | null | undefined }[] = [];
    (prisma.banner as { create: jest.Mock }).create.mockImplementationOnce(
      async ({ data }: { data: { schedules: { create: { displayDate: Date; tier: string; vipPushTiming?: string | null }[] } } }) => ({
        id: 'banner-multi',
        schedules: data.schedules.create.map((row, index) => {
          const y = row.displayDate.getUTCFullYear();
          const mo = String(row.displayDate.getUTCMonth() + 1).padStart(2, '0');
          const d = String(row.displayDate.getUTCDate()).padStart(2, '0');
          captured.push({
            date: `${y}-${mo}-${d}`,
            timing: row.vipPushTiming ?? null,
          });
          return {
            id: `sch-m-${index}`,
            displayDate: row.displayDate,
            ibgeCityId: 3550308,
            tier: row.tier,
            vipCreditEntryId: null,
            vipPushTiming: row.vipPushTiming ?? null,
          };
        }),
      }),
    );
    await service.create(
      'owner-1',
      'https://cdn.example/multi.jpg',
      [],
      'Multi',
      'Texto',
      null,
      [VIP_A, VIP_B],
      undefined,
      [
        { date: VIP_A, pushTiming: 'SLOT_11' },
        { date: VIP_B, pushTiming: 'SLOT_17' },
      ],
    );
    expect(wallet.vipBalance).toBe(0);
    expect(captured).toEqual([
      { date: VIP_A, timing: 'SLOT_11' },
      { date: VIP_B, timing: 'SLOT_17' },
    ]);
  });

  it('mesma chave de idempotência não debita duas vezes', async () => {
    const { service, wallet, entries } = setup({ balance: 0, vipBalance: 2 });
    const key = 'd'.repeat(16);
    const args = [
      'owner-1',
      'https://cdn.example/a.jpg',
      [],
      'Título',
      'Texto',
      null,
      [VIP_A],
      key,
      vipPublications(VIP_A),
    ] as const;
    await service.create(...args);
    await service.create(...args);
    expect(wallet.vipBalance).toBe(1);
    expect(entries).toHaveLength(1);
  });
});
