import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toMoneyNumber, zeroMoney } from './money';
import {
  YearMonth,
  formatYearMonth,
  lastYearMonths,
  monthRangeUtc,
} from './timezone';

export const REAL_SALE_PROVIDERS = [
  'google_play',
  'app_store',
  'pix',
  'card',
] as const;

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

/** Admin sales history. Revenue stays on realSaleWhere. */
export const SALE_HISTORY_STATUSES = ['PAID', 'REFUNDED'] as const;

export const saleHistoryWhere = {
  status: { in: [...SALE_HISTORY_STATUSES] },
  packageKey: { not: 'welcome' },
  provider: { in: [...REAL_SALE_PROVIDERS] },
  confirmedAt: { not: null },
} satisfies Prisma.CreditPurchaseWhereInput;

export function emptyProviderMoney(): ProviderMoney {
  return {
    google_play: 0,
    app_store: 0,
    pix: 0,
    card: 0,
  };
}

export function isRealSaleProvider(
  provider: string | null | undefined,
): provider is RealSaleProvider {
  return (REAL_SALE_PROVIDERS as readonly string[]).includes(provider ?? '');
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
    card: zeroMoney(),
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
      card: toMoneyNumber(byProviderDec.card),
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

export type RefundPosition = {
  yearMonth: string;
  paidSalesBrl: number;
  fullRefundsBrl: number;
  partialRefundsBrl: number;
  partialsWithoutAmount: number;
  refundReviewsOpen: number;
  revenueAfterRefundsBrl: number;
  revenueComplete: boolean;
};

/**
 * Current position of sales confirmed in one period.
 * Full refunds stay visible and are not subtracted again: those purchases
 * are already absent from the paid sum. Each purchase contributes one
 * partial_review amount, the latest accumulated sum, so a second partial
 * updates that row instead of being added again. Unknown partial amounts
 * are omitted from the partial sum and mark the revenue figure incomplete.
 */
export function buildRefundPosition(input: {
  yearMonth: string;
  paid: Prisma.Decimal;
  fullRefunds: Prisma.Decimal;
  partialKnown: Prisma.Decimal;
  partialsWithoutAmount: number;
  refundReviewsOpen?: number;
}): RefundPosition {
  return {
    yearMonth: input.yearMonth,
    paidSalesBrl: toMoneyNumber(input.paid),
    fullRefundsBrl: toMoneyNumber(input.fullRefunds),
    partialRefundsBrl: toMoneyNumber(input.partialKnown),
    partialsWithoutAmount: input.partialsWithoutAmount,
    refundReviewsOpen: input.refundReviewsOpen ?? 0,
    revenueAfterRefundsBrl: toMoneyNumber(input.paid.minus(input.partialKnown)),
    revenueComplete: input.partialsWithoutAmount === 0,
  };
}

export async function fullRefundsInRange(
  prisma: PrismaService,
  start: Date,
  end: Date,
): Promise<Prisma.Decimal> {
  const result = await prisma.creditPurchase.aggregate({
    where: {
      status: 'REFUNDED',
      packageKey: { not: 'welcome' },
      provider: { in: [...REAL_SALE_PROVIDERS] },
      confirmedAt: { gte: start, lt: end },
    },
    _sum: { amountPaid: true },
  });
  return result._sum.amountPaid ?? zeroMoney();
}

export async function partialRefundsInRange(
  prisma: PrismaService,
  start: Date,
  end: Date,
): Promise<{ known: Prisma.Decimal; unknown: number }> {
  const rows = await prisma.$queryRaw<
    Array<{ known: unknown; unknownCount: unknown }>
  >`
    SELECT
      COALESCE(SUM(a."refundedAmount"), 0) AS known,
      COUNT(*) FILTER (WHERE a."refundedAmount" IS NULL)::int AS "unknownCount"
    FROM "CreditRefundAudit" a
    INNER JOIN "CreditPurchase" p ON p.id = a."purchaseId"
    WHERE a.kind = 'partial_review'
      AND p.status = 'PAID'
      AND p."packageKey" <> 'welcome'
      AND p.provider IN (${Prisma.join([...REAL_SALE_PROVIDERS])})
      AND p."confirmedAt" >= ${start}
      AND p."confirmedAt" < ${end}
  `;
  const row = rows[0];
  return {
    known: asDecimal(row?.known),
    unknown: Number(row?.unknownCount ?? 0),
  };
}

/**
 * Purchases with an unproven refund signal that still needs an admin look.
 * The unit is the purchase. A later partial_review closes an earlier signal:
 * there is no separate resolved flag, and the partial row is the proof that
 * followed it. A partial recorded earlier does not close a signal recorded
 * afterwards. A full refund leaves the audit in history and drops the count
 * because the purchase is no longer PAID. The period is the purchase
 * confirmation, the same window as the other refund figures.
 */
export async function openRefundReviewsInRange(
  prisma: PrismaService,
  start: Date,
  end: Date,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: unknown }>>`
    SELECT COUNT(DISTINCT a."purchaseId")::int AS n
    FROM "CreditRefundAudit" a
    INNER JOIN "CreditPurchase" p ON p.id = a."purchaseId"
    WHERE a.kind = 'refund_review'
      AND p.status = 'PAID'
      AND p."packageKey" <> 'welcome'
      AND p.provider IN (${Prisma.join([...REAL_SALE_PROVIDERS])})
      AND p."confirmedAt" >= ${start}
      AND p."confirmedAt" < ${end}
      AND NOT EXISTS (
        SELECT 1
        FROM "CreditRefundAudit" laterPartial
        WHERE laterPartial."purchaseId" = a."purchaseId"
          AND laterPartial.kind = 'partial_review'
          AND laterPartial."createdAt" >= a."createdAt"
      )
  `;
  return Number(rows[0]?.n ?? 0);
}

function asDecimal(value: unknown): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'bigint') return new Prisma.Decimal(value.toString());
  if (typeof value === 'number' || typeof value === 'string') {
    return new Prisma.Decimal(value);
  }
  return zeroMoney();
}
