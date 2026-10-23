import { AgeBand, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  realSaleWhere,
  salesByProviderInRange,
  summarizeProviderGroups,
} from './finance';

export type RankedCity = { city: string; state: string; count: number };
export type CityLocation = { city: string; state: string; accountCount: number };
export type RankedCategory = { category: string; count: number };
export type CountBucket = { key: string; count: number };

const CONSUMER_ROLES: Role[] = [Role.USER, Role.VENUE];

export const AGE_BAND_UNKNOWN = 'UNKNOWN';

export function isVipPackageKey(packageKey: string): boolean {
  const key = packageKey.toLowerCase();
  return key.startsWith('vip') || key.includes('vip_');
}

export function normalizeAgeBandKey(
  band: AgeBand | null | undefined,
): string {
  return band ?? AGE_BAND_UNKNOWN;
}

export function normalizeCategoryKey(category: string | null | undefined): string {
  const trimmed = category?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Não informado';
}

export async function topCitiesNewAccountsInRange(
  prisma: PrismaService,
  start: Date,
  end: Date,
  limit = 3,
): Promise<RankedCity[]> {
  const rows = await prisma.$queryRaw<
    Array<{ city: string; state: string; count: bigint }>
  >`
    SELECT u.city, u.state, COUNT(*)::bigint AS count
    FROM "User" u
    WHERE u.role IN ('USER', 'VENUE')
      AND u."createdAt" >= ${start}
      AND u."createdAt" < ${end}
    GROUP BY u.city, u.state
    ORDER BY count DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    city: row.city,
    state: row.state,
    count: Number(row.count),
  }));
}

export async function topVenueCategoriesCreatedInRange(
  prisma: PrismaService,
  start: Date,
  end: Date,
  limit = 3,
): Promise<RankedCategory[]> {
  const rows = await prisma.$queryRaw<
    Array<{ category: string; count: bigint }>
  >`
    SELECT COALESCE(NULLIF(TRIM(v.category), ''), 'Não informado') AS category,
           COUNT(*)::bigint AS count
    FROM "Venue" v
    WHERE v."createdAt" >= ${start}
      AND v."createdAt" < ${end}
    GROUP BY category
    ORDER BY count DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    category: row.category,
    count: Number(row.count),
  }));
}

export async function reportsCreatedInRange(
  prisma: PrismaService,
  start: Date,
  end: Date,
): Promise<number> {
  return prisma.report.count({
    where: { createdAt: { gte: start, lt: end } },
  });
}

export async function countUsersByAgeBand(
  prisma: PrismaService,
  where: Prisma.UserWhereInput,
): Promise<CountBucket[]> {
  const groups = await prisma.user.groupBy({
    by: ['ageBand'],
    where: { ...where, role: Role.USER },
    _count: { _all: true },
  });
  return groups
    .map((row) => ({
      key: normalizeAgeBandKey(row.ageBand),
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function countVenuesByCategory(
  prisma: PrismaService,
  city?: string,
  state?: string,
): Promise<CountBucket[]> {
  const rows =
    city && state
      ? await prisma.$queryRaw<Array<{ category: string; count: bigint }>>`
          SELECT COALESCE(NULLIF(TRIM(v.category), ''), 'Não informado') AS category,
                 COUNT(*)::bigint AS count
          FROM "Venue" v
          WHERE v.city = ${city} AND v.state = ${state}
          GROUP BY category
          ORDER BY count DESC
        `
      : await prisma.$queryRaw<Array<{ category: string; count: bigint }>>`
          SELECT COALESCE(NULLIF(TRIM(v.category), ''), 'Não informado') AS category,
                 COUNT(*)::bigint AS count
          FROM "Venue" v
          GROUP BY category
          ORDER BY count DESC
        `;
  return rows.map((row) => ({
    key: row.category,
    count: Number(row.count),
  }));
}

export type PaidSalesSummary = {
  yearMonth: string | null;
  from: string | null;
  to: string | null;
  paidPurchases: number;
  creditsSold: number;
  grossRevenueBrl: number;
  revenueByProvider: ReturnType<typeof summarizeProviderGroups>['byProvider'];
  commonCredits: number;
  vipCredits: number;
  packages: {
    unit1: number;
    combo5: number;
    combo10: number;
  };
};

export async function paidSalesSummaryInRange(
  prisma: PrismaService,
  start: Date,
  end: Date,
  meta: { yearMonth?: string; from?: string; to?: string },
): Promise<PaidSalesSummary> {
  const providerSummary = await salesByProviderInRange(prisma, start, end);
  const packageGroups = await prisma.creditPurchase.groupBy({
    by: ['packageKey'],
    where: {
      ...realSaleWhere,
      confirmedAt: { gte: start, lt: end },
    },
    _count: { _all: true },
    _sum: { credits: true },
  });

  let commonCredits = 0;
  let vipCredits = 0;
  let unit1 = 0;
  let combo5 = 0;
  let combo10 = 0;

  for (const row of packageGroups) {
    const credits = row._sum.credits ?? 0;
    const purchases = row._count._all;
    const key = row.packageKey.toLowerCase();
    if (isVipPackageKey(key)) {
      vipCredits += credits;
    } else {
      commonCredits += credits;
    }
    if (key === 'unit_1') unit1 += purchases;
    if (key === 'combo_5') combo5 += purchases;
    if (key === 'combo_10') combo10 += purchases;
  }

  return {
    yearMonth: meta.yearMonth ?? null,
    from: meta.from ?? null,
    to: meta.to ?? null,
    paidPurchases: providerSummary.purchases,
    creditsSold: providerSummary.credits,
    grossRevenueBrl: providerSummary.grossRevenueBrl,
    revenueByProvider: providerSummary.byProvider,
    commonCredits,
    vipCredits,
    packages: { unit1, combo5, combo10 },
  };
}

export async function listConsumerCityLocations(
  prisma: PrismaService,
): Promise<CityLocation[]> {
  const rows = await prisma.$queryRaw<
    Array<{ city: string; state: string; count: bigint }>
  >`
    SELECT u.city, u.state, COUNT(*)::bigint AS count
    FROM "User" u
    WHERE u.role IN ('USER', 'VENUE')
      AND NULLIF(TRIM(u.city), '') IS NOT NULL
      AND NULLIF(TRIM(u.state), '') IS NOT NULL
    GROUP BY u.city, u.state
    ORDER BY u.state ASC, u.city ASC
  `;
  return rows.map((row) => ({
    city: row.city,
    state: row.state,
    accountCount: Number(row.count),
  }));
}

export async function consumerTotals(prisma: PrismaService) {
  const roleCounts = await prisma.user.groupBy({
    by: ['role'],
    where: { role: { in: CONSUMER_ROLES } },
    _count: { _all: true },
  });
  const users =
    roleCounts.find((row) => row.role === Role.USER)?._count._all ?? 0;
  const venues =
    roleCounts.find((row) => row.role === Role.VENUE)?._count._all ?? 0;
  return { users, venues, accounts: users + venues };
}
