import { randomUUID } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { BannersService } from '../../src/banners/banners.service';
import {
  ISOLATED_PG_DATABASE,
  ISOLATED_PG_HOST,
  ISOLATED_PG_PASSWORD,
  ISOLATED_PG_PORT,
  ISOLATED_PG_USER,
  isolatedSuiteRunAuthorized,
} from '../../src/credits/isolated-pg-guard';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  PromoPushPublisher,
  PromoPushEventWriter,
} from '../../src/promo-push/promo-push.publisher';
import { planPromoPushEvents } from '../../src/promo-push/promo-push.plan';
import { readVipPushSlots } from '../../src/promo-push/promo-push.slots';
import {
  civilDateLabel,
  timingToSlot,
  VIP_PUSH_IMMEDIATE_SLOT,
} from '../../src/promo-push/vip-push-timing';
import { openIsolatedSession } from './session';

function disposableUrl(): string {
  const url = `postgresql://${ISOLATED_PG_USER}:${ISOLATED_PG_PASSWORD}@${ISOLATED_PG_HOST}:${ISOLATED_PG_PORT}/${ISOLATED_PG_DATABASE}?schema=public`;
  if (
    url !==
    'postgresql://after_credit_ledger_test:disposable-local-only@127.0.0.1:55432/after_credit_ledger_test?schema=public'
  ) {
    throw new Error('destino PostgreSQL recusado');
  }
  return url;
}

const suite = isolatedSuiteRunAuthorized(process.env) ? describe : describe.skip;

type Seed = { userId: string; venueId: string; prefix: string };

function isolatedPublisher(client: PrismaClient): PromoPushPublisher {
  return {
    resolveVenueCity: async () => null,
    recordSchedules: async (db: PromoPushEventWriter, input) => {
      const drafts = planPromoPushEvents({
        ...input,
        slots: readVipPushSlots(process.env),
      });
      if (!drafts.length) return;
      await db.promoPushEvent.createMany({ data: drafts, skipDuplicates: true });
    },
    skipBanner: async (bannerId: string) => {
      await client.promoPushEvent.updateMany({
        where: {
          bannerId,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'SKIPPED',
          error: 'BANNER_CANCELLED',
          lockedUntil: null,
          lockedBy: null,
        },
      });
    },
  };
}

suite('homologação PostgreSQL — publicação VIP multidata', () => {
  let prisma: PrismaClient;
  let banners: BannersService;
  let seq = 0;

  beforeAll(async () => {
    process.env.PROMO_PUSH_VIP_SLOT_TIMES = '11:00,17:00';
    const session = await openIsolatedSession();
    try {
      const rows = await session.query<{ current_database: string }>(
        'SELECT current_database() AS current_database',
      );
      if (rows[0]?.current_database !== ISOLATED_PG_DATABASE) {
        throw new Error('banco PostgreSQL recusado');
      }
    } finally {
      await session.close();
    }
    prisma = new PrismaClient({ datasources: { db: { url: disposableUrl() } } });
    await prisma.$connect();
    const publisher = isolatedPublisher(prisma);
    banners = new BannersService(
      prisma as unknown as PrismaService,
      {
        get: (key: string) => (key === 'CREDIT_PER_DISPLAY_DAY' ? '1' : undefined),
      } as unknown as ConfigService,
      {
        notifyFavoriteFollowers: async () => undefined,
      } as unknown as NotificationsService,
      publisher,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function seedWallet(vipBalance: number, commonBalance = 0): Promise<Seed> {
    seq += 1;
    const prefix = `bvp${seq}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const user = await prisma.user.create({
      data: {
        name: 'Bar PG',
        email: `${prefix}@example.test`,
        passwordHash: 'fixture-not-a-credential',
        role: 'VENUE',
        state: 'SP',
        city: 'Campinas',
      },
    });
    const venue = await prisma.venue.create({
      data: {
        ownerUserId: user.id,
        name: 'Bar PG',
        city: 'Campinas',
        state: 'SP',
        ibgeCityId: 3509502,
      },
    });
    await prisma.creditWallet.create({
      data: { venueId: venue.id, balance: commonBalance, vipBalance },
    });
    return { userId: user.id, venueId: venue.id, prefix };
  }

  async function tearDown(seed: Seed): Promise<void> {
    const bannerIds = (
      await prisma.banner.findMany({
        where: { venueId: seed.venueId },
        select: { id: true },
      })
    ).map((row) => row.id);
    if (bannerIds.length) {
      await prisma.promoPushEvent.deleteMany({
        where: { bannerId: { in: bannerIds } },
      });
      await prisma.bannerSchedule.deleteMany({
        where: { bannerId: { in: bannerIds } },
      });
      await prisma.banner.deleteMany({ where: { id: { in: bannerIds } } });
    }
    await prisma.bannerPublicationIdempotency.deleteMany({
      where: { venueId: seed.venueId },
    });
    await prisma.vipCreditEntry.deleteMany({ where: { venueId: seed.venueId } });
    await prisma.creditWallet.deleteMany({ where: { venueId: seed.venueId } });
    await prisma.venue.delete({ where: { id: seed.venueId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: seed.userId } }).catch(() => undefined);
  }

  async function wallet(venueId: string) {
    return prisma.creditWallet.findUniqueOrThrow({ where: { venueId } });
  }

  function idemKey(label: string): string {
    const base = `pg-${label}-`.padEnd(16, 'x');
    return base.length >= 16 ? base.slice(0, 24) : base.padEnd(16, 'x');
  }

  it('schema contém tabelas VIP push', async () => {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN (
          'BannerSchedule',
          'VipCreditEntry',
          'BannerPublicationIdempotency',
          'PromoPushEvent'
        )
    `;
    expect(tables.map((row) => row.tablename).sort()).toEqual([
      'BannerPublicationIdempotency',
      'BannerSchedule',
      'PromoPushEvent',
      'VipCreditEntry',
    ]);
  });

  it('1 — VIP uma data com vipPublications (SLOT_11)', async () => {
    const fx = await seedWallet(2);
    try {
      const day = '2099-04-10';
      const created = await banners.create(
        fx.userId,
        'https://example.test/vip-one.png',
        [],
        'VIP um dia',
        'desc',
        null,
        [day],
        undefined,
        [{ date: day, pushTiming: 'SLOT_11' }],
      );
      const w = await wallet(fx.venueId);
      expect(w.vipBalance).toBe(1);
      const schedules = await prisma.bannerSchedule.findMany({
        where: { bannerId: created.id },
      });
      expect(schedules).toHaveLength(1);
      expect(schedules[0]?.vipPushTiming).toBe('SLOT_11');
      const events = await prisma.promoPushEvent.findMany({
        where: { bannerId: created.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0]?.slot).toBe(timingToSlot('SLOT_11'));
      const consumes = await prisma.vipCreditEntry.count({
        where: { venueId: fx.venueId, kind: 'consume' },
      });
      expect(consumes).toBe(1);
    } finally {
      await tearDown(fx);
    }
  });

  it('2 — VIP multidata com horários distintos', async () => {
    const fx = await seedWallet(3);
    try {
      const d1 = '2099-05-10';
      const d2 = '2099-05-11';
      const created = await banners.create(
        fx.userId,
        'https://example.test/vip-multi.png',
        [],
        'Multi',
        'desc',
        null,
        [d1, d2],
        undefined,
        [
          { date: d1, pushTiming: 'SLOT_11' },
          { date: d2, pushTiming: 'SLOT_17' },
        ],
      );
      expect((await wallet(fx.venueId)).vipBalance).toBe(1);
      const events = await prisma.promoPushEvent.findMany({
        where: { bannerId: created.id },
        orderBy: { slot: 'asc' },
      });
      expect(events).toHaveLength(2);
      expect(new Set(events.map((e) => e.bannerScheduleId)).size).toBe(2);
    } finally {
      await tearDown(fx);
    }
  });

  it('3 — IMMEDIATE hoje e SLOT_11 amanhã (relógio SP)', async () => {
    const fx = await seedWallet(2);
    jest.useFakeTimers({
      now: new Date('2026-06-10T22:00:00.000Z'),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
        'queueMicrotask',
      ],
    });
    try {
      const today = civilDateLabel(new Date());
      const tomorrow = '2026-06-11';
      const created = await banners.create(
        fx.userId,
        'https://example.test/vip-mix.png',
        [],
        'Hoje e amanhã',
        'desc',
        null,
        [today, tomorrow],
        undefined,
        [
          { date: today, pushTiming: 'IMMEDIATE' },
          { date: tomorrow, pushTiming: 'SLOT_11' },
        ],
      );
      const events = await prisma.promoPushEvent.findMany({
        where: { bannerId: created.id },
      });
      expect(events).toHaveLength(2);
      const immediate = events.find((e) => e.slot === VIP_PUSH_IMMEDIATE_SLOT);
      expect(immediate).toBeDefined();
      expect(immediate!.availableAt.getTime()).toBeLessThanOrEqual(Date.now());
      const slot11 = events.find((e) => e.slot === timingToSlot('SLOT_11'));
      expect(slot11).toBeDefined();
      expect(slot11!.availableAt.getTime()).toBeGreaterThan(Date.now());
    } finally {
      jest.useRealTimers();
      await tearDown(fx);
    }
  });

  it('4 — SLOT_17 hoje e SLOT_11 amanhã (relógio SP)', async () => {
    const fx = await seedWallet(2);
    jest.useFakeTimers({
      now: new Date('2026-06-10T19:59:59.000Z'),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
        'queueMicrotask',
      ],
    });
    try {
      const today = civilDateLabel(new Date());
      const tomorrow = '2026-06-11';
      await banners.create(
        fx.userId,
        'https://example.test/vip-17-11.png',
        [],
        '17 e 11',
        'desc',
        null,
        [today, tomorrow],
        undefined,
        [
          { date: today, pushTiming: 'SLOT_17' },
          { date: tomorrow, pushTiming: 'SLOT_11' },
        ],
      );
      const events = await prisma.promoPushEvent.findMany({
        where: { venueId: fx.venueId },
      });
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.slot).sort()).toEqual(
        [timingToSlot('SLOT_11'), timingToSlot('SLOT_17')].sort(),
      );
    } finally {
      jest.useRealTimers();
      await tearDown(fx);
    }
  });

  it('5–6 — um crédito VIP e um evento por agendamento', async () => {
    const fx = await seedWallet(2);
    try {
      const d1 = '2099-07-01';
      const d2 = '2099-07-02';
      const created = await banners.create(
        fx.userId,
        'https://example.test/vip-debit.png',
        [],
        'Debito',
        'desc',
        null,
        [d1, d2],
        undefined,
        [
          { date: d1, pushTiming: 'SLOT_11' },
          { date: d2, pushTiming: 'SLOT_17' },
        ],
      );
      expect((await wallet(fx.venueId)).vipBalance).toBe(0);
      const entries = await prisma.vipCreditEntry.findMany({
        where: { venueId: fx.venueId, kind: 'consume' },
      });
      expect(entries).toHaveLength(2);
      const events = await prisma.promoPushEvent.findMany({
        where: { bannerId: created.id },
      });
      expect(events).toHaveLength(2);
    } finally {
      await tearDown(fx);
    }
  });

  it('8–9 — idempotência: replay não duplica crédito nem evento', async () => {
    const fx = await seedWallet(2);
    const key = idemKey('replay');
    try {
      const day = '2099-08-01';
      const args = [
        fx.userId,
        'https://example.test/vip-idem.png',
        [],
        'Idem',
        'desc',
        null,
        [day],
        key,
        [{ date: day, pushTiming: 'SLOT_11' }],
      ] as const;
      const first = await banners.create(...args);
      const w1 = await wallet(fx.venueId);
      const events1 = await prisma.promoPushEvent.count({
        where: { bannerId: first.id },
      });
      const second = await banners.create(...args);
      const w2 = await wallet(fx.venueId);
      const events2 = await prisma.promoPushEvent.count({
        where: { bannerId: second.id },
      });
      expect(second.id).toBe(first.id);
      expect(w2.vipBalance).toBe(w1.vipBalance);
      expect(events2).toBe(events1);
      expect(
        await prisma.vipCreditEntry.count({
          where: { venueId: fx.venueId, kind: 'consume' },
        }),
      ).toBe(1);
    } finally {
      await tearDown(fx);
    }
  });

  it('10–11 — mesma chave e payload diferente retorna 409', async () => {
    const fx = await seedWallet(2);
    const key = idemKey('conflict');
    try {
      const day = '2099-08-15';
      await banners.create(
        fx.userId,
        'https://example.test/a.png',
        [],
        'A',
        'desc',
        null,
        [day],
        key,
        [{ date: day, pushTiming: 'SLOT_11' }],
      );
      await expect(
        banners.create(
          fx.userId,
          'https://example.test/b.png',
          [],
          'B',
          'desc',
          null,
          [day],
          key,
          [{ date: day, pushTiming: 'SLOT_17' }],
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await wallet(fx.venueId)).vipBalance).toBe(1);
    } finally {
      await tearDown(fx);
    }
  });

  it('12–13 — concorrência com mesma chave debita uma vez', async () => {
    const fx = await seedWallet(2);
    const key = idemKey('race');
    try {
      const day = '2099-09-01';
      const body = [
        fx.userId,
        'https://example.test/race.png',
        [],
        'Race',
        'desc',
        null,
        [day],
        key,
        [{ date: day, pushTiming: 'SLOT_11' }],
      ] as const;
      const [a, b] = await Promise.all([
        banners.create(...body),
        banners.create(...body),
      ]);
      expect(a.id).toBe(b.id);
      expect(
        await prisma.vipCreditEntry.count({
          where: { venueId: fx.venueId, kind: 'consume' },
        }),
      ).toBe(1);
      expect((await wallet(fx.venueId)).vipBalance).toBe(1);
    } finally {
      await tearDown(fx);
    }
  });

  it('9 legado — vipDates sem vipPublications publica e consome crédito', async () => {
    const fx = await seedWallet(1);
    try {
      const day = '2099-10-01';
      const created = await banners.create(
        fx.userId,
        'https://example.test/legacy.png',
        [],
        'Legado',
        'desc',
        null,
        [day],
      );
      const schedule = await prisma.bannerSchedule.findFirst({
        where: { bannerId: created.id },
      });
      expect(schedule?.vipPushTiming).toBeNull();
      expect((await wallet(fx.venueId)).vipBalance).toBe(0);
      const events = await prisma.promoPushEvent.findMany({
        where: { bannerId: created.id },
      });
      expect(events.length).toBeLessThanOrEqual(1);
    } finally {
      await tearDown(fx);
    }
  });

  it('14 — cancelamento antes do disparo marca push como SKIPPED', async () => {
    const fx = await seedWallet(1);
    try {
      const day = '2099-11-01';
      const created = await banners.create(
        fx.userId,
        'https://example.test/cancel.png',
        [],
        'Cancel',
        'desc',
        null,
        [day],
        undefined,
        [{ date: day, pushTiming: 'SLOT_11' }],
      );
      await banners.cancel(fx.userId, created.id);
      const events = await prisma.promoPushEvent.findMany({
        where: { bannerId: created.id },
      });
      expect(events.every((e) => e.status === 'SKIPPED')).toBe(true);
      expect(
        await prisma.banner.findUnique({ where: { id: created.id } }),
      ).toMatchObject({ status: 'CANCELLED' });
    } finally {
      await tearDown(fx);
    }
  });

  it('15 — publicação COMMON não cria PromoPushEvent VIP', async () => {
    const fx = await seedWallet(0, 3);
    try {
      const day = '2099-12-01';
      const created = await banners.create(
        fx.userId,
        'https://example.test/common.png',
        [day],
        'Comum',
        'desc',
        null,
        [],
      );
      expect((await wallet(fx.venueId)).balance).toBe(2);
      expect((await wallet(fx.venueId)).vipBalance).toBe(0);
      const events = await prisma.promoPushEvent.findMany({
        where: { bannerId: created.id },
      });
      expect(events).toHaveLength(0);
      const schedules = await prisma.bannerSchedule.findMany({
        where: { bannerId: created.id },
      });
      expect(schedules.every((s) => s.tier === 'COMMON')).toBe(true);
    } finally {
      await tearDown(fx);
    }
  });
});
