import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toMoneyNumber, zeroMoney } from './money';
import {
  YearMonth,
  formatYearMonth,
  lastYearMonths,
  monthRangeUtc,
} from './timezone';

export const REAL_SALE_PROVIDERS = ['google_play', 'app_store', 'pix'] as const;

export type RealSaleProvider = (typeof REAL_SALE_PROVIDERS)[number];

export type ProviderMoney = Record<RealSaleProvider, number>;

export type MonthlySalesRow = {
  yearMonth: string;
  purchases: number;
  credits: number;
  grossRevenueBrl: number;
  byProvider: ProviderMoney;
};

export const realSaleWhere = {
  status: 'PAID',
  packageKey: { not: 'welcome' },
  provider: { in: [...REAL_SALE_PROVIDERS] },
  confirmedAt: { not: null },
} satisfies Prisma.CreditPurchaseWhereInput;

export function emptyProviderMoney(): ProviderMoney {
  return {
    google_play: 0,
    app_store: 0,
    pix: 0,
  };
}

export function isRealSaleProvider(
  provider: string | null | undefined,
): provider is RealSaleProvider {
  return (
    provider === 'google_play' || provider === 'app_store' || provider === 'pix'
  );
}

type ProviderGroup = {
  provider: string | null;
  _count: { _all: number };
  _sum: { credits: number | null; amountPaid: Prisma.Decimal | null };
};

export function summarizeProviderGroups(groups: ProviderGroup[]): {
  purchases: number;
  credits: number;
  grossRevenueBrl: number;
  byProvider: ProviderMoney;
} {
  const byProviderDec: Record<RealSaleProvider, Prisma.Decimal> = {
    google_play: zeroMoney(),
    app_store: zeroMoney(),
    pix: zeroMoney(),
  };
  let purchases = 0;
  let credits = 0;
  let revenue = zeroMoney();

  for (const row of groups) {
    if (!isRealSaleProvider(row.provider)) continue;
    purchases += row._count._all;
    credits += row._sum.credits ?? 0;
    const amount = row._sum.amountPaid ?? zeroMoney();
    revenue = revenue.add(amount);
    byProviderDec[row.provider] = byProviderDec[row.provider].add(amount);
  }

  return {
    purchases,
    credits,
    grossRevenueBrl: toMoneyNumber(revenue),
    byProvider: {
      google_play: toMoneyNumber(byProviderDec.google_play),
      app_store: toMoneyNumber(byProviderDec.app_store),
      pix: toMoneyNumber(byProviderDec.pix),
    },
  };
}

export async function salesByProviderInRange(
  prisma: PrismaService,
  start: Date,
  end: Date,
) {
  const groups = await prisma.creditPurchase.groupBy({
    by: ['provider'],
    where: {
      ...realSaleWhere,
      confirmedAt: { gte: start, lt: end },
    },
    _count: { _all: true },
    _sum: { credits: true, amountPaid: true },
  });
  return summarizeProviderGroups(groups);
}

export async function monthlySalesHistory(
  prisma: PrismaService,
  months: number,
  now = new Date(),
): Promise<MonthlySalesRow[]> {
  const yearMonths = lastYearMonths(months, now);
  const rows = await Promise.all(
    yearMonths.map(async (ym) => {
      const { start, end } = monthRangeUtc(ym);
      const summary = await salesByProviderInRange(prisma, start, end);
      return {
        yearMonth: formatYearMonth(ym),
        purchases: summary.purchases,
        credits: summary.credits,
        grossRevenueBrl: summary.grossRevenueBrl,
        byProvider: summary.byProvider,
      };
    }),
  );
  return rows;
}

export function currentYearMonth(now = new Date()): YearMonth {
  return lastYearMonths(1, now)[0];
}
