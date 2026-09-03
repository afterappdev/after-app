import { Prisma, Role } from '@prisma/client';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { monthRangeUtc } from './timezone';

type Sale = {
  status: string;
  packageKey: string;
  provider: string | null;
  credits: number;
  amountPaid: Prisma.Decimal;
  confirmedAt: Date | null;
};

function createPrisma(
  sales: Sale[],
  users: Array<{ role: Role; createdAt: Date }>,
) {
  const prisma = {
    user: {
      groupBy: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    creditPurchase: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  prisma.user.groupBy.mockImplementation(
    (args: { where?: { role?: { in?: Role[] } } }) => {
      const allowed = args.where?.role?.in ?? [Role.USER, Role.VENUE];
      const counts = new Map<Role, number>();
      for (const user of users) {
        if (!allowed.includes(user.role)) continue;
        counts.set(user.role, (counts.get(user.role) ?? 0) + 1);
      }
      return Promise.resolve(
        [...counts.entries()].map(([role, total]) => ({
          role,
          _count: { _all: total },
        })),
      );
    },
  );

  prisma.user.count.mockImplementation(
    (args: {
      where?: { role?: { in?: Role[] }; createdAt?: { gte: Date; lt: Date } };
    }) => {
      const allowed = args.where?.role?.in ?? [Role.USER, Role.VENUE];
      const gte = args.where?.createdAt?.gte;
      const lt = args.where?.createdAt?.lt;
      return Promise.resolve(
        users.filter((user) => {
          if (!allowed.includes(user.role)) return false;
          if (gte && user.createdAt < gte) return false;
          if (lt && user.createdAt >= lt) return false;
          return true;
        }).length,
      );
    },
  );

  prisma.user.findMany.mockResolvedValue([]);

  prisma.creditPurchase.groupBy.mockImplementation(
    (args: {
      where: {
        status?: string;
        packageKey?: { not?: string };
        provider?: { in?: string[] };
        confirmedAt?: { not?: null; gte?: Date; lt?: Date };
      };
    }) => {
      const where = args.where;
      const filtered = sales.filter((sale) => {
        if (where.status && sale.status !== where.status) return false;
        if (where.packageKey?.not && sale.packageKey === where.packageKey.not) {
          return false;
        }
        if (
          where.provider?.in &&
          !where.provider.in.includes(sale.provider ?? '')
        ) {
          return false;
        }
        if (where.confirmedAt?.not === null && sale.confirmedAt == null)
          return false;
        if (
          where.confirmedAt?.gte &&
          (sale.confirmedAt == null || sale.confirmedAt < where.confirmedAt.gte)
        ) {
          return false;
        }
        if (
          where.confirmedAt?.lt &&
          (sale.confirmedAt == null || sale.confirmedAt >= where.confirmedAt.lt)
        ) {
          return false;
        }
        return true;
      });
      const grouped = new Map<string, Sale[]>();
      for (const sale of filtered) {
        const key = sale.provider ?? 'null';
        const list = grouped.get(key) ?? [];
        list.push(sale);
        grouped.set(key, list);
      }
      return Promise.resolve(
        [...grouped.entries()].map(([provider, rows]) => ({
          provider: provider === 'null' ? null : provider,
          _count: { _all: rows.length },
          _sum: {
            credits: rows.reduce((sum, row) => sum + row.credits, 0),
            amountPaid: rows.reduce(
              (sum, row) => sum.add(row.amountPaid),
              new Prisma.Decimal(0),
            ),
          },
        })),
      );
    },
  );

  prisma.creditPurchase.findMany.mockResolvedValue([]);
  prisma.creditPurchase.count.mockImplementation(() =>
    Promise.resolve(
      sales.filter(
        (sale) =>
          sale.status === 'PAID' &&
          sale.packageKey !== 'welcome' &&
          ['google_play', 'app_store', 'pix'].includes(sale.provider ?? '') &&
          sale.confirmedAt == null,
      ).length,
    ),
  );

  return prisma;
}

function firstMockArg(mock: jest.Mock): {
  where: {
    confirmedAt?: { gte: Date; lt: Date };
    role?: { in: Role[] };
  };
} {
  const calls = mock.mock.calls as unknown as Array<
    [
      {
        where: { confirmedAt?: { gte: Date; lt: Date }; role?: { in: Role[] } };
      },
    ]
  >;
  return calls[0][0];
}

function sale(
  partial: Partial<Sale> &
    Pick<Sale, 'provider' | 'credits' | 'amountPaid' | 'confirmedAt'>,
): Sale {
  return {
    status: 'PAID',
    packageKey: 'unit_1',
    ...partial,
  };
}

describe('AdminDashboardService metrics', () => {
  const now = new Date('2026-09-03T15:00:00.000Z');
  const september = monthRangeUtc({ year: 2026, month: 9 });
  const augustPaid = new Date('2026-09-01T02:59:59.000Z');
  const septemberPaid = new Date('2026-09-01T03:00:00.000Z');

  it('welcome, stub e PENDING não entram; PIX/Play/Apple PAID entram', async () => {
    const prisma = createPrisma(
      [
        sale({
          packageKey: 'welcome',
          provider: null,
          credits: 2,
          amountPaid: new Prisma.Decimal(0),
          confirmedAt: septemberPaid,
        }),
        sale({
          provider: 'stub',
          credits: 1,
          amountPaid: new Prisma.Decimal(25),
          confirmedAt: septemberPaid,
        }),
        sale({
          status: 'PENDING',
          provider: 'pix',
          credits: 10,
          amountPaid: new Prisma.Decimal(200),
          confirmedAt: null,
        }),
        sale({
          provider: 'pix',
          packageKey: 'combo_5',
          credits: 5,
          amountPaid: new Prisma.Decimal(115),
          confirmedAt: septemberPaid,
        }),
        sale({
          provider: 'google_play',
          credits: 1,
          amountPaid: new Prisma.Decimal(25),
          confirmedAt: septemberPaid,
        }),
        sale({
          provider: 'app_store',
          credits: 10,
          amountPaid: new Prisma.Decimal(200),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.month.yearMonth).toBe('2026-09');
    expect(result.month.paidPurchases).toBe(3);
    expect(result.month.creditsSold).toBe(16);
    expect(result.month.grossRevenueBrl).toBe(340);
    expect(result.month.revenueByProvider).toEqual({
      google_play: 25,
      app_store: 200,
      pix: 115,
    });
    const monthWhere = firstMockArg(prisma.creditPurchase.groupBy).where
      .confirmedAt;
    expect(monthWhere?.gte).toEqual(september.start);
    expect(monthWhere?.lt).toEqual(september.end);
  });

  it('confirmedAt determina o mês da venda, não createdAt', async () => {
    const prisma = createPrisma(
      [
        sale({
          provider: 'pix',
          credits: 1,
          amountPaid: new Prisma.Decimal(25),
          confirmedAt: augustPaid,
        }),
        sale({
          provider: 'pix',
          credits: 5,
          amountPaid: new Prisma.Decimal(115),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);
    expect(result.month.paidPurchases).toBe(1);
    expect(result.month.creditsSold).toBe(5);
    expect(result.month.grossRevenueBrl).toBe(115);
    const august = result.history.find((row) => row.yearMonth === '2026-08');
    expect(august?.purchases).toBe(1);
    expect(august?.credits).toBe(1);
    expect(august?.grossRevenueBrl).toBe(25);
  });

  it('ADMIN não entra em totals.accounts e history tem 12 meses inclusive zerados', async () => {
    const prisma = createPrisma(
      [],
      [
        { role: Role.USER, createdAt: septemberPaid },
        { role: Role.VENUE, createdAt: septemberPaid },
        { role: Role.ADMIN, createdAt: septemberPaid },
      ],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.totals).toEqual({ accounts: 2, users: 1, venues: 1 });
    expect(result.month.newAccounts).toBe(2);
    expect(result.history).toHaveLength(12);
    expect(result.history[0].yearMonth).toBe('2025-10');
    expect(result.history[11].yearMonth).toBe('2026-09');
    expect(result.history.every((row) => row.purchases === 0)).toBe(true);
    expect(result.history[0].byProvider).toEqual({
      google_play: 0,
      app_store: 0,
      pix: 0,
    });
    expect(firstMockArg(prisma.user.groupBy).where.role?.in).toEqual([
      Role.USER,
      Role.VENUE,
    ]);
  });

  it('paidPurchases conta compras e creditsSold soma créditos', async () => {
    const prisma = createPrisma(
      [
        sale({
          provider: 'pix',
          packageKey: 'combo_10',
          credits: 10,
          amountPaid: new Prisma.Decimal(200),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);
    expect(result.month.paidPurchases).toBe(1);
    expect(result.month.creditsSold).toBe(10);
  });

  it('sinaliza PAID real sem confirmedAt em warnings', async () => {
    const prisma = createPrisma(
      [
        sale({
          provider: 'pix',
          credits: 1,
          amountPaid: new Prisma.Decimal(25),
          confirmedAt: null,
        }),
      ],
      [],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);
    expect(result.month.paidPurchases).toBe(0);
    expect(result.warnings).toEqual([
      { code: 'PAID_MISSING_CONFIRMED_AT', count: 1 },
    ]);
  });
});
