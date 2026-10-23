import { PrismaClient } from '@prisma/client';
import { isolatedSuiteRunAuthorized } from '../../src/credits/isolated-pg-guard';
import { planIbgeBackfill } from '../../src/promo-push/ibge-backfill';
import { PrismaPromoPushStore } from '../../src/promo-push/promo-push.store';
import { PromoPushWorker } from '../../src/promo-push/promo-push.worker';
import { openIsolatedSession } from './session';

const suite = isolatedSuiteRunAuthorized(process.env) ? describe : describe.skip;
const now = new Date('2026-10-20T15:00:00.000Z');
const todayStart = new Date('2026-10-20T03:00:00.000Z');
const todayEnd = new Date('2026-10-21T03:00:00.000Z');

function databaseUrl(): string {
  return `postgresql://${process.env.AFTER_ISOLATED_PG_USER}:${process.env.AFTER_ISOLATED_PG_PASSWORD}@${process.env.AFTER_ISOLATED_PG_HOST}:${process.env.AFTER_ISOLATED_PG_PORT}/${process.env.AFTER_ISOLATED_PG_DATABASE}`;
}

class FakeMessaging {
  configured = true;
  calls: string[][] = [];
  mode: 'ok' | 'invalid' | 'throw' = 'ok';
  sendToTokens(tokens: string[]) {
    this.calls.push([...tokens]);
    if (this.mode === 'throw') return Promise.reject(new Error('temporary'));
    return Promise.resolve(
      tokens.map((token) => ({
        token,
        success: this.mode === 'ok',
        invalid: this.mode === 'invalid',
      })),
    );
  }
}

suite('promo push isolated postgres', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await wipe(prisma);
  });

  it('a migration deixa a API antiga inserir e a nova ler os campos', async () => {
    const session = await openIsolatedSession();
    try {
      const tables = await session.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('DevicePushToken', 'PromoPushEvent', 'PromoPushDelivery', 'PromoPushWorkerLock')`,
        [],
      );
      expect(tables.map((row) => row.table_name).sort()).toEqual([
        'DevicePushToken',
        'PromoPushDelivery',
        'PromoPushEvent',
        'PromoPushWorkerLock',
      ]);
      await session.query(
        `INSERT INTO "User" (id, name, email, "passwordHash", role, state, city, "updatedAt")
         VALUES ('ppt-old-user', 'Antigo', 'ppt-old@example.com', 'hash', 'USER', 'SP', 'São Paulo', NOW())`,
        [],
      );
      const user = await session.query<{
        promoNotificationsEnabled: boolean;
        ibgeCityId: number | null;
      }>(
        `SELECT "promoNotificationsEnabled", "ibgeCityId" FROM "User" WHERE id = 'ppt-old-user'`,
        [],
      );
      expect(user[0].promoNotificationsEnabled).toBe(false);
      expect(user[0].ibgeCityId).toBeNull();
      await session.query(
        `INSERT INTO "User" (id, name, email, "passwordHash", role, state, city, "updatedAt")
         VALUES ('ppt-old-owner', 'Dono', 'ppt-owner@example.com', 'hash', 'VENUE', 'SP', 'São Paulo', NOW())`,
        [],
      );
      await session.query(
        `INSERT INTO "Venue" (id, "ownerUserId", name, city, state, "updatedAt")
         VALUES ('ppt-old-venue', 'ppt-old-owner', 'Bar', 'São Paulo', 'SP', NOW())`,
        [],
      );
      await session.query(
        `INSERT INTO "Banner" (id, "venueId", "imageUrl", "creditsCost", status, "updatedAt")
         VALUES ('ppt-old-banner', 'ppt-old-venue', 'https://cdn.example/a.jpg', 1, 'ACTIVE', NOW())`,
        [],
      );
      const banner = await session.query<{ contentKind: string | null }>(
        `SELECT "contentKind" FROM "Banner" WHERE id = 'ppt-old-banner'`,
        [],
      );
      expect(banner[0].contentKind).toBeNull();
    } finally {
      await session.close();
    }

    const read = await prisma.user.findUnique({
      where: { id: 'ppt-old-user' },
      select: { promoNotificationsEnabled: true, ibgeCityId: true },
    });
    expect(read).toEqual({ promoNotificationsEnabled: false, ibgeCityId: null });
    await wipe(prisma);
  });

  it('dois workers, lock expirado, retry, token inválido e janela encerrada', async () => {
    await seedBase(prisma);
    const store = new PrismaPromoPushStore(prisma);
    const messaging = new FakeMessaging();
    const worker = new PromoPushWorker(store, messaging)
      .useEnv({
        PROMO_PUSH_ENABLED: 'true',
        PROMO_PUSH_MAX_PER_USER_PER_DAY: '5',
        PROMO_PUSH_LOCATION_MAX_AGE_HOURS: '6',
      })
      .useWorkerId('worker-a');
    const other = new PromoPushWorker(store, messaging)
      .useEnv({ PROMO_PUSH_ENABLED: 'true' })
      .useWorkerId('worker-b');

    await Promise.all([
      worker.processOne('ppt-event', now, { kind: 'public' }),
      other.processOne('ppt-event', now, { kind: 'public' }),
    ]);
    expect(messaging.calls).toHaveLength(1);
    expect(await prisma.promoPushEvent.findUnique({ where: { id: 'ppt-event' } })).toEqual(
      expect.objectContaining({ status: 'SENT' }),
    );

    await prisma.promoPushEvent.update({
      where: { id: 'ppt-event' },
      data: {
        status: 'PROCESSING',
        lockedUntil: new Date(now.getTime() - 1000),
        lockedBy: 'dead',
        sentAt: null,
      },
    });
    await prisma.promoPushDelivery.deleteMany({ where: { eventId: 'ppt-event' } });
    messaging.calls.length = 0;
    await worker.processOne('ppt-event', now, { kind: 'public' });
    expect(messaging.calls).toHaveLength(1);

    await prisma.promoPushDelivery.deleteMany({ where: { eventId: 'ppt-event' } });
    await prisma.promoPushEvent.update({
      where: { id: 'ppt-event' },
      data: { status: 'PENDING', lockedUntil: null, lockedBy: null, attempts: 0 },
    });
    messaging.mode = 'throw';
    messaging.calls.length = 0;
    await worker.processOne('ppt-event', now, { kind: 'public' });
    const retried = await prisma.promoPushEvent.findUniqueOrThrow({
      where: { id: 'ppt-event' },
    });
    expect(retried.status).toBe('PENDING');
    expect(retried.error).toBe('FCM_TEMPORARY');
    messaging.mode = 'ok';
    await worker.processOne('ppt-event', retried.availableAt, { kind: 'public' });
    expect(
      (await prisma.promoPushEvent.findUnique({ where: { id: 'ppt-event' } }))?.status,
    ).toBe('SENT');

    await prisma.promoPushDelivery.deleteMany({ where: { eventId: 'ppt-event' } });
    await prisma.devicePushToken.update({
      where: { id: 'ppt-token' },
      data: { disabledAt: null },
    });
    await prisma.promoPushEvent.update({
      where: { id: 'ppt-event' },
      data: {
        status: 'PENDING',
        lockedUntil: null,
        lockedBy: null,
        attempts: 0,
        error: null,
        sentAt: null,
        availableAt: todayStart,
        expiresAt: todayEnd,
      },
    });
    messaging.mode = 'invalid';
    messaging.calls.length = 0;
    await worker.processOne('ppt-event', now, { kind: 'public' });
    expect(
      (await prisma.devicePushToken.findUnique({ where: { id: 'ppt-token' } }))?.disabledAt,
    ).not.toBeNull();
    expect(
      (await prisma.promoPushDelivery.findFirst({ where: { eventId: 'ppt-event' } }))?.status,
    ).toBe('INVALID');

    await prisma.promoPushEvent.update({
      where: { id: 'ppt-event' },
      data: {
        status: 'PENDING',
        expiresAt: new Date(now.getTime() - 1000),
        lockedUntil: null,
        lockedBy: null,
      },
    });
    const expired = await store.expireOverdue(now);
    expect(expired).toBe(1);
    messaging.mode = 'ok';
    messaging.calls.length = 0;
    await worker.dispatchDue(now, { kind: 'public' });
    expect(messaging.calls).toHaveLength(0);
    expect(
      (await prisma.promoPushEvent.findUnique({ where: { id: 'ppt-event' } }))?.error,
    ).toBe('WINDOW_CLOSED');
  });

  it('limite de cinco, várias datas, cancelamento e queda depois do aceite', async () => {
    await seedBase(prisma);
    for (let index = 0; index < 5; index += 1) {
      await prisma.bannerSchedule.create({
        data: {
          id: `ppt-cap-sch-${index}`,
          bannerId: 'ppt-banner',
          displayDate: new Date('2026-10-20T00:00:00.000Z'),
          citySnapshot: 'São Paulo',
          ibgeCityId: 3550308,
        },
      });
      await prisma.promoPushEvent.create({
        data: {
          id: `ppt-cap-${index}`,
          bannerScheduleId: `ppt-cap-sch-${index}`,
          bannerId: 'ppt-banner',
          venueId: 'ppt-venue',
          ibgeCityId: 3550308,
          displayDate: new Date('2026-10-20T00:00:00.000Z'),
          status: 'SENT',
          availableAt: todayStart,
          expiresAt: todayEnd,
          sentAt: now,
        },
      });
      await prisma.promoPushDelivery.create({
        data: {
          eventId: `ppt-cap-${index}`,
          tokenId: 'ppt-token',
          userId: 'ppt-user',
          status: 'SENT',
          sentAt: now,
        },
      });
    }
    const store = new PrismaPromoPushStore(prisma);
    const messaging = new FakeMessaging();
    const worker = new PromoPushWorker(store, messaging)
      .useEnv({ PROMO_PUSH_ENABLED: 'true', PROMO_PUSH_MAX_PER_USER_PER_DAY: '5' })
      .useWorkerId('worker-a');
    await worker.processOne('ppt-event', now, { kind: 'public' });
    expect(messaging.calls).toHaveLength(0);

    await prisma.bannerSchedule.create({
      data: {
        id: 'ppt-future-sch',
        bannerId: 'ppt-banner',
        displayDate: new Date('2026-10-22T00:00:00.000Z'),
        citySnapshot: 'São Paulo',
        ibgeCityId: 3550308,
      },
    });
    await prisma.promoPushEvent.create({
      data: {
        id: 'ppt-future',
        bannerScheduleId: 'ppt-future-sch',
        bannerId: 'ppt-banner',
        venueId: 'ppt-venue',
        ibgeCityId: 3550308,
        displayDate: new Date('2026-10-22T00:00:00.000Z'),
        status: 'PENDING',
        availableAt: new Date('2026-10-22T03:00:00.000Z'),
        expiresAt: new Date('2026-10-23T03:00:00.000Z'),
      },
    });
    await worker.dispatchDue(now, { kind: 'public' });
    expect(
      (await prisma.promoPushEvent.findUnique({ where: { id: 'ppt-future' } }))?.status,
    ).toBe('PENDING');

    await prisma.banner.update({
      where: { id: 'ppt-banner' },
      data: { status: 'CANCELLED' },
    });
    await prisma.promoPushEvent.update({
      where: { id: 'ppt-future' },
      data: { availableAt: todayStart, expiresAt: todayEnd },
    });
    await prisma.promoPushEvent.updateMany({
      where: { bannerId: 'ppt-banner', status: { in: ['PENDING', 'PROCESSING'] } },
      data: {
        status: 'SKIPPED',
        error: 'BANNER_CANCELLED',
        lockedUntil: null,
        lockedBy: null,
      },
    });
    messaging.calls.length = 0;
    await worker.dispatchDue(now, { kind: 'public' });
    expect(messaging.calls).toHaveLength(0);
    expect(
      (await prisma.promoPushEvent.findUnique({ where: { id: 'ppt-future' } }))?.error,
    ).toBe('BANNER_CANCELLED');

    await prisma.banner.update({
      where: { id: 'ppt-banner' },
      data: { status: 'ACTIVE' },
    });
    await prisma.promoPushEvent.update({
      where: { id: 'ppt-event' },
      data: {
        status: 'PENDING',
        error: null,
        lockedUntil: null,
        lockedBy: null,
        attempts: 0,
        expiresAt: todayEnd,
      },
    });
    await prisma.promoPushDelivery.deleteMany({ where: { eventId: 'ppt-event' } });
    const crash = new CrashOnceStore(prisma);
    const crashMessaging = new FakeMessaging();
    const crashWorker = new PromoPushWorker(crash, crashMessaging)
      .useEnv({ PROMO_PUSH_ENABLED: 'true', PROMO_PUSH_MAX_PER_USER_PER_DAY: '100' })
      .useWorkerId('worker-crash');
    await prisma.user.update({
      where: { id: 'ppt-user' },
      data: { promoNotificationsEnabled: true },
    });
    await expect(
      crashWorker.processOne('ppt-event', now, { kind: 'public' }),
    ).rejects.toThrow('crash after accept');
    expect(crashMessaging.calls).toHaveLength(1);
    expect(
      (await prisma.promoPushDelivery.findFirst({ where: { eventId: 'ppt-event' } }))?.status,
    ).toBe('CLAIMED');
    await prisma.promoPushEvent.update({
      where: { id: 'ppt-event' },
      data: { lockedUntil: new Date(now.getTime() - 1000) },
    });
    await crashWorker.processOne('ppt-event', now, { kind: 'public' });
    expect(crashMessaging.calls).toHaveLength(2);
  });

  it('o backfill preenche nulos únicos e não sobrescreve id existente', async () => {
    await seedBase(prisma);
    await prisma.user.update({
      where: { id: 'ppt-user' },
      data: { ibgeCityId: null, city: 'São Paulo', state: 'SP' },
    });
    await prisma.user.create({
      data: {
        id: 'ppt-homonym',
        name: 'Homônimo',
        email: 'ppt-homonym@example.com',
        passwordHash: 'hash',
        role: 'USER',
        city: 'Bom Jesus',
        state: 'SP',
      },
    });
    await prisma.venue.update({
      where: { id: 'ppt-venue' },
      data: { ibgeCityId: 3550308 },
    });
    const cities = [
      { id: 3550308, name: 'São Paulo', uf: 'SP' },
      { id: 2201903, name: 'Bom Jesus', uf: 'PI' },
      { id: 2502300, name: 'Bom Jesus', uf: 'PB' },
    ];
    const users = await prisma.user.findMany({
      where: { id: { in: ['ppt-user', 'ppt-homonym'] } },
      select: { id: true, city: true, state: true, ibgeCityId: true },
    });
    const venues = await prisma.venue.findMany({
      where: { id: 'ppt-venue' },
      select: { id: true, city: true, state: true, ibgeCityId: true },
    });
    const userPlan = planIbgeBackfill(users, cities);
    const venuePlan = planIbgeBackfill(venues, cities);
    expect(userPlan).toEqual([{ id: 'ppt-user', ibgeCityId: 3550308 }]);
    expect(venuePlan).toEqual([]);
    for (const row of userPlan) {
      await prisma.user.updateMany({
        where: { id: row.id, ibgeCityId: null },
        data: { ibgeCityId: row.ibgeCityId },
      });
    }
    expect((await prisma.user.findUnique({ where: { id: 'ppt-user' } }))?.ibgeCityId).toBe(
      3550308,
    );
    expect((await prisma.user.findUnique({ where: { id: 'ppt-homonym' } }))?.ibgeCityId).toBeNull();
    expect((await prisma.venue.findUnique({ where: { id: 'ppt-venue' } }))?.ibgeCityId).toBe(
      3550308,
    );
  });
});

class CrashOnceStore extends PrismaPromoPushStore {
  private pending = true;

  override async markDeliveries(
    updates: Parameters<PrismaPromoPushStore['markDeliveries']>[0],
  ): Promise<void> {
    if (this.pending) {
      this.pending = false;
      throw new Error('crash after accept');
    }
    await super.markDeliveries(updates);
  }
}

async function seedBase(prisma: PrismaClient): Promise<void> {
  await prisma.user.create({
    data: {
      id: 'ppt-owner',
      name: 'Dono',
      email: 'ppt-owner-live@example.com',
      passwordHash: 'hash',
      role: 'VENUE',
      city: 'São Paulo',
      state: 'SP',
    },
  });
  await prisma.venue.create({
    data: {
      id: 'ppt-venue',
      ownerUserId: 'ppt-owner',
      name: 'Bar Central',
      city: 'São Paulo',
      state: 'SP',
      ibgeCityId: 3550308,
    },
  });
  await prisma.user.create({
    data: {
      id: 'ppt-user',
      name: 'Ana',
      email: 'ppt-user@example.com',
      passwordHash: 'hash',
      role: 'USER',
      city: 'São Paulo',
      state: 'SP',
      ibgeCityId: 3550308,
      promoNotificationsEnabled: true,
    },
  });
  await prisma.devicePushToken.create({
    data: {
      id: 'ppt-token',
      userId: 'ppt-user',
      token: 'ppt-token-value-0001',
      platform: 'android',
    },
  });
  await prisma.banner.create({
    data: {
      id: 'ppt-banner',
      venueId: 'ppt-venue',
      imageUrl: 'https://cdn.example/a.jpg',
      creditsCost: 1,
      status: 'ACTIVE',
    },
  });
  await prisma.vipCreditEntry.create({
    data: {
      id: 'ppt-vip-entry',
      venueId: 'ppt-venue',
      operationKey: 'ppt-vip-consume',
      kind: 'consume',
      credits: 1,
      balanceDelta: -1,
      bannerId: 'ppt-banner',
      scheduleId: 'ppt-schedule',
    },
  });
  await prisma.bannerSchedule.create({
    data: {
      id: 'ppt-schedule',
      bannerId: 'ppt-banner',
      displayDate: new Date('2026-10-20T00:00:00.000Z'),
      citySnapshot: 'São Paulo',
      ibgeCityId: 3550308,
      tier: 'VIP',
      vipCreditEntryId: 'ppt-vip-entry',
    },
  });
  await prisma.promoPushEvent.create({
    data: {
      id: 'ppt-event',
      bannerScheduleId: 'ppt-schedule',
      bannerId: 'ppt-banner',
      venueId: 'ppt-venue',
      ibgeCityId: 3550308,
      displayDate: new Date('2026-10-20T00:00:00.000Z'),
      status: 'PENDING',
      availableAt: todayStart,
      expiresAt: todayEnd,
    },
  });
}

async function wipe(prisma: PrismaClient): Promise<void> {
  await prisma.promoPushDelivery.deleteMany({
    where: { OR: [{ eventId: { startsWith: 'ppt-' } }, { userId: { startsWith: 'ppt-' } }] },
  });
  await prisma.promoPushEvent.deleteMany({
    where: { id: { startsWith: 'ppt-' } },
  });
  await prisma.devicePushToken.deleteMany({
    where: { id: { startsWith: 'ppt-' } },
  });
  await prisma.bannerSchedule.deleteMany({
    where: { id: { startsWith: 'ppt-' } },
  });
  await prisma.banner.deleteMany({ where: { id: { startsWith: 'ppt-' } } });
  await prisma.venue.deleteMany({ where: { id: { startsWith: 'ppt-' } } });
  await prisma.user.deleteMany({
    where: { OR: [{ id: { startsWith: 'ppt-' } }, { email: { startsWith: 'ppt-' } }] },
  });
}
