import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  currentYearMonth,
  monthlySalesHistory,
  realSaleWhere,
  salesByProviderInRange,
} from '../finance';
import { toMoneyNumber } from '../money';
import { formatYearMonth, monthRangeUtc } from '../timezone';

const CONSUMER_ROLES: Role[] = [Role.USER, Role.VENUE];
const RECENT_LIMIT = 10;

export type AdminDashboardWarning = {
  code: 'PAID_MISSING_CONFIRMED_AT';
  count: number;
};

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(now = new Date()) {
    const ym = currentYearMonth(now);
    const { start, end } = monthRangeUtc(ym);

    const [
      roleCounts,
      newAccounts,
      monthSales,
      history,
      recentAccounts,
      recentSales,
      missingConfirmedAt,
    ] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role'],
        where: { role: { in: CONSUMER_ROLES } },
        _count: { _all: true },
      }),
      this.prisma.user.count({
        where: {
          role: { in: CONSUMER_ROLES },
          createdAt: { gte: start, lt: end },
        },
      }),
      salesByProviderInRange(this.prisma, start, end),
      monthlySalesHistory(this.prisma, 12, now),
      this.prisma.user.findMany({
        where: { role: { in: CONSUMER_ROLES } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          venue: { select: { id: true, name: true } },
        },
      }),
      this.prisma.creditPurchase.findMany({
        where: realSaleWhere,
        orderBy: { confirmedAt: 'desc' },
        take: RECENT_LIMIT,
        select: {
          id: true,
          packageKey: true,
          credits: true,
          amountPaid: true,
          currency: true,
          provider: true,
          confirmedAt: true,
          venueId: true,
          venue: { select: { name: true } },
        },
      }),
      this.prisma.creditPurchase.count({
        where: {
          status: 'PAID',
          packageKey: { not: 'welcome' },
          provider: { in: ['google_play', 'app_store', 'pix'] },
          confirmedAt: null,
        },
      }),
    ]);

    const users =
      roleCounts.find((row) => row.role === Role.USER)?._count._all ?? 0;
    const venues =
      roleCounts.find((row) => row.role === Role.VENUE)?._count._all ?? 0;

    const warnings: AdminDashboardWarning[] = [];
    if (missingConfirmedAt > 0) {
      warnings.push({
        code: 'PAID_MISSING_CONFIRMED_AT',
        count: missingConfirmedAt,
      });
    }

    return {
      totals: {
        accounts: users + venues,
        users,
        venues,
      },
      month: {
        yearMonth: formatYearMonth(ym),
        newAccounts,
        paidPurchases: monthSales.purchases,
        creditsSold: monthSales.credits,
        grossRevenueBrl: monthSales.grossRevenueBrl,
        revenueByProvider: monthSales.byProvider,
      },
      history,
      recentAccounts: recentAccounts.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        ...(user.role === Role.VENUE && user.venue
          ? { venueId: user.venue.id, venueName: user.venue.name }
          : {}),
      })),
      recentSales: recentSales.map((sale) => ({
        id: sale.id,
        packageKey: sale.packageKey,
        credits: sale.credits,
        amountPaid: toMoneyNumber(sale.amountPaid),
        currency: sale.currency,
        provider: sale.provider,
        confirmedAt: sale.confirmedAt,
        venueId: sale.venueId,
        venueName: sale.venue.name,
      })),
      warnings,
    };
  }
}
