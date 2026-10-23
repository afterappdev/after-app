/**
 * Optional PostgreSQL integration checks (synthetic data only).
 *
 * Run manually against loopback with a disposable DB that has the current schema:
 *   ADMIN_AGGREGATES_IT=authorized
 *   ADMIN_AGGREGATES_IT_DATABASE_URL=postgresql://...@127.0.0.1:.../after_admin_it?schema=public
 *
 * Never point at Railway, production, or after-api-v2-db.
 */
import { PrismaClient, Role } from '@prisma/client';
import {
  countUsersByAgeBand,
  countVenuesByCategory,
  listConsumerCityLocations,
  paidSalesSummaryInRange,
  reportsCreatedInRange,
  topCitiesNewAccountsInRange,
  topVenueCategoriesCreatedInRange,
} from './aggregates';
import { monthRangeUtc } from './timezone';

function loopbackUrl(): string | null {
  if (process.env.ADMIN_AGGREGATES_IT !== 'authorized') return null;
  const raw = process.env.ADMIN_AGGREGATES_IT_DATABASE_URL?.trim() ?? '';
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!lower.includes('127.0.0.1') && !lower.includes('localhost')) return null;
  if (['railway', 'rlwy', 'amazonaws', 'production'].some((m) => lower.includes(m))) {
    return null;
  }
  return raw;
}

const itUrl = loopbackUrl();
const describeIt = itUrl ? describe : describe.skip;

describeIt('admin aggregates on loopback PostgreSQL', () => {
  let prisma: PrismaClient;
  const tag = `it-${Date.now()}`;

  beforeAll(() => {
    prisma = new PrismaClient({
      datasources: { db: { url: itUrl! } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.report.deleteMany({
      where: { description: { contains: tag } },
    });
    await prisma.creditPurchase.deleteMany({
      where: { venue: { name: { startsWith: tag } } },
    });
    await prisma.venue.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  });

  it('rankings and reports respect month range (America/Sao_Paulo)', async () => {
    const { start, end } = monthRangeUtc({ year: 2026, month: 9 });
    const beforeMonth = new Date(start.getTime() - 60_000);
    const inMonth = new Date(start.getTime() + 3_600_000);

    const userA = await prisma.user.create({
      data: {
        email: `${tag}-a@after.local`,
        passwordHash: 'x',
        name: `${tag} A`,
        role: Role.USER,
        state: 'SP',
        city: 'São Paulo',
        ageBand: 'AGE_19_35',
        createdAt: inMonth,
      },
    });
    await prisma.user.create({
      data: {
        email: `${tag}-b@after.local`,
        passwordHash: 'x',
        name: `${tag} B`,
        role: Role.USER,
        state: 'MG',
        city: 'São Paulo',
        createdAt: beforeMonth,
      },
    });

    const cities = await topCitiesNewAccountsInRange(prisma as never, start, end);
    expect(cities.some((c) => c.city === 'São Paulo' && c.state === 'SP')).toBe(true);
    expect(
      cities.find((c) => c.city === 'São Paulo' && c.state === 'MG'),
    ).toBeUndefined();

    await prisma.report.create({
      data: {
        reason: 'OTHER',
        description: `${tag} report`,
        status: 'PENDING',
        targetType: 'REVIEW',
        targetId: userA.id,
        reporterId: userA.id,
        createdAt: inMonth,
      },
    });
    const reports = await reportsCreatedInRange(prisma as never, start, end);
    expect(reports).toBeGreaterThanOrEqual(1);
  });

  it('city+state scopes age bands and categories', async () => {
    const venueUser = await prisma.user.create({
      data: {
        email: `${tag}-venue@after.local`,
        passwordHash: 'x',
        name: `${tag} Venue Owner`,
        role: Role.VENUE,
        state: 'PR',
        city: 'Curitiba',
        venue: {
          create: {
            name: `${tag} Bar`,
            category: ' Bar ',
            state: 'PR',
            city: 'Curitiba',
          },
        },
      },
      include: { venue: true },
    });
    void venueUser;

    const bands = await countUsersByAgeBand(prisma as never, {
      city: 'Curitiba',
      state: 'PR',
    });
    expect(Array.isArray(bands)).toBe(true);

    const categories = await countVenuesByCategory(
      prisma as never,
      'Curitiba',
      'PR',
    );
    expect(categories.some((b) => b.key === 'Bar')).toBe(true);
  });

  it('paid sales summary excludes welcome and splits VIP', async () => {
    const owner = await prisma.user.create({
      data: {
        email: `${tag}-pay@after.local`,
        passwordHash: 'x',
        name: `${tag} Pay`,
        role: Role.VENUE,
        state: 'SP',
        city: 'Campinas',
        venue: {
          create: {
            name: `${tag} Pay Venue`,
            state: 'SP',
            city: 'Campinas',
            wallet: { create: { balance: 0 } },
          },
        },
      },
      include: { venue: true },
    });
    const venueId = owner.venue!.id;
    const confirmedAt = new Date('2026-09-15T15:00:00.000Z');

    await prisma.creditPurchase.createMany({
      data: [
        {
          venueId,
          packageKey: 'welcome',
          credits: 1,
          amountPaid: 0,
          currency: 'BRL',
          status: 'PAID',
          provider: 'pix',
          confirmedAt,
        },
        {
          venueId,
          packageKey: 'unit_1',
          credits: 1,
          amountPaid: 25,
          currency: 'BRL',
          status: 'PAID',
          provider: 'pix',
          confirmedAt,
        },
        {
          venueId,
          packageKey: 'vip_unit_1',
          credits: 1,
          amountPaid: 40,
          currency: 'BRL',
          status: 'PAID',
          provider: 'card',
          confirmedAt,
        },
      ],
    });

    const { start, end } = monthRangeUtc({ year: 2026, month: 9 });
    const summary = await paidSalesSummaryInRange(prisma as never, start, end, {
      yearMonth: '2026-09',
    });
    expect(summary.paidPurchases).toBeGreaterThanOrEqual(2);
    expect(summary.commonCredits).toBeGreaterThanOrEqual(1);
    expect(summary.vipCredits).toBeGreaterThanOrEqual(1);
    expect(summary.packages.unit1).toBeGreaterThanOrEqual(1);
  });

  it('homonymous cities stay distinct in rankings and location list', async () => {
    const { start, end } = monthRangeUtc({ year: 2099, month: 2 });
    const inMonth = new Date(start.getTime() + 3_600_000);

    await prisma.user.createMany({
      data: [
        {
          email: `${tag}-hom-sp@after.local`,
          passwordHash: 'x',
          name: `${tag} SP`,
          role: Role.USER,
          state: 'SP',
          city: 'São Paulo',
          createdAt: inMonth,
        },
        {
          email: `${tag}-hom-mg@after.local`,
          passwordHash: 'x',
          name: `${tag} MG`,
          role: Role.USER,
          state: 'MG',
          city: 'São Paulo',
          createdAt: inMonth,
        },
      ],
    });

    const top = await topCitiesNewAccountsInRange(prisma as never, start, end, 5);
    const sp = top.find((r) => r.city === 'São Paulo' && r.state === 'SP');
    const mg = top.find((r) => r.city === 'São Paulo' && r.state === 'MG');
    expect(sp?.count).toBeGreaterThanOrEqual(1);
    expect(mg?.count).toBeGreaterThanOrEqual(1);

    const locations = await listConsumerCityLocations(prisma as never);
    expect(
      locations.filter((l) => l.city === 'São Paulo').map((l) => l.state).sort(),
    ).toEqual(expect.arrayContaining(['MG', 'SP']));

    const spBands = await countUsersByAgeBand(prisma as never, {
      city: 'São Paulo',
      state: 'SP',
    });
    const mgBands = await countUsersByAgeBand(prisma as never, {
      city: 'São Paulo',
      state: 'MG',
    });
    const spTotal = spBands.reduce((s, b) => s + b.count, 0);
    const mgTotal = mgBands.reduce((s, b) => s + b.count, 0);
    expect(spTotal).toBeGreaterThanOrEqual(1);
    expect(mgTotal).toBeGreaterThanOrEqual(1);
  });

  it('month with no fixtures returns empty rankings and zero reports', async () => {
    const { start, end } = monthRangeUtc({ year: 2020, month: 1 });
    const cities = await topCitiesNewAccountsInRange(prisma as never, start, end);
    const categories = await topVenueCategoriesCreatedInRange(
      prisma as never,
      start,
      end,
    );
    const reports = await reportsCreatedInRange(prisma as never, start, end);
    expect(cities.length).toBe(0);
    expect(categories.length).toBe(0);
    expect(reports).toBe(0);
  });

  it('REFUNDED purchases are excluded from paid sales summary', async () => {
    const owner = await prisma.user.create({
      data: {
        email: `${tag}-ref@after.local`,
        passwordHash: 'x',
        name: `${tag} Ref`,
        role: Role.VENUE,
        state: 'RJ',
        city: 'Rio de Janeiro',
        venue: {
          create: {
            name: `${tag} Ref Venue`,
            state: 'RJ',
            city: 'Rio de Janeiro',
            wallet: { create: { balance: 0 } },
          },
        },
      },
      include: { venue: true },
    });
    const venueId = owner.venue!.id;
    const { start } = monthRangeUtc({ year: 2099, month: 3 });
    const confirmedAt = new Date(start.getTime() + 3_600_000);
    await prisma.creditPurchase.createMany({
      data: [
        {
          venueId,
          packageKey: 'combo_5',
          credits: 5,
          amountPaid: 100,
          currency: 'BRL',
          status: 'REFUNDED',
          provider: 'pix',
          confirmedAt,
        },
        {
          venueId,
          packageKey: 'combo_10',
          credits: 10,
          amountPaid: 200,
          currency: 'BRL',
          status: 'PAID',
          provider: 'pix',
          confirmedAt,
        },
      ],
    });
    const { start: rangeStart, end } = monthRangeUtc({ year: 2099, month: 3 });
    const summary = await paidSalesSummaryInRange(
      prisma as never,
      rangeStart,
      end,
      {},
    );
    expect(summary.paidPurchases).toBe(1);
    expect(summary.packages.combo10).toBe(1);
    expect(summary.packages.combo5).toBe(0);
  });
});
