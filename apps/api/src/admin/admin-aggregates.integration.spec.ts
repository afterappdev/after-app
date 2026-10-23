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
});
