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

type PartialAudit = {
  kind: string;
  refundedAmount: Prisma.Decimal | null;
  status: string;
  packageKey: string;
  provider: string | null;
  confirmedAt: Date | null;
  purchaseId?: string;
  recordedAt?: Date;
};

function purchaseMatches(
  sale: Sale,
  where: {
    status?: string;
    packageKey?: { not?: string };
    provider?: { in?: string[] };
    confirmedAt?: { not?: null; gte?: Date; lt?: Date };
  },
) {
  if (where.status && sale.status !== where.status) return false;
  if (where.packageKey?.not && sale.packageKey === where.packageKey.not) {
    return false;
  }
  if (where.provider?.in && !where.provider.in.includes(sale.provider ?? '')) {
    return false;
  }
  if (where.confirmedAt?.not === null && sale.confirmedAt == null) return false;
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
}

function createPrisma(
  sales: Sale[],
  users: Array<{ role: Role; createdAt: Date }>,
  partialAudits: PartialAudit[] = [],
) {
  const prisma = {
    user: {
      groupBy: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    creditPurchase: {
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    report: {
      count: jest.fn().mockResolvedValue(0),
    },
    $queryRaw: jest.fn(),
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
      by?: string[];
      where: {
        status?: string;
        packageKey?: { not?: string };
        provider?: { in?: string[] };
        confirmedAt?: { not?: null; gte?: Date; lt?: Date };
      };
    }) => {
      const where = args.where;
      const filtered = sales.filter((sale) => purchaseMatches(sale, where));
      const dimension = args.by?.[0] ?? 'provider';
      const grouped = new Map<string, Sale[]>();
      for (const sale of filtered) {
        const key =
          dimension === 'packageKey'
            ? sale.packageKey
            : (sale.provider ?? 'null');
        const list = grouped.get(key) ?? [];
        list.push(sale);
        grouped.set(key, list);
      }
      return Promise.resolve(
        [...grouped.entries()].map(([key, rows]) => ({
          ...(dimension === 'packageKey'
            ? { packageKey: key }
            : { provider: key === 'null' ? null : key }),
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

  prisma.creditPurchase.aggregate.mockImplementation(
    (args: { where: Parameters<typeof purchaseMatches>[1] }) => {
      const filtered = sales.filter((sale) =>
        purchaseMatches(sale, args.where),
      );
      const amountPaid = filtered.reduce(
        (sum, row) => sum.add(row.amountPaid),
        new Prisma.Decimal(0),
      );
      return Promise.resolve({
        _sum: { amountPaid: filtered.length === 0 ? null : amountPaid },
      });
    },
  );

  prisma.$queryRaw.mockImplementation(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.from(strings).join(' ');
      if (sql.includes('FROM "User" u') || sql.includes('FROM "Venue" v')) {
        return Promise.resolve([]);
      }
      if (!sql.includes('CreditRefundAudit')) return Promise.resolve([]);
      const dates = values.filter(
        (value): value is Date => value instanceof Date,
      );
      const start = dates[0];
      const end = dates[1];
      const matched = partialAudits.filter((audit) => {
        if (audit.status !== 'PAID') return false;
        if (audit.packageKey === 'welcome') return false;
        if (
          !['google_play', 'app_store', 'pix', 'card'].includes(
            audit.provider ?? '',
          )
        ) {
          return false;
        }
        if (audit.confirmedAt == null) return false;
        if (start && audit.confirmedAt < start) return false;
        if (end && audit.confirmedAt >= end) return false;
        return true;
      });
      if (sql.includes("kind = 'refund_review'")) {
        const open = matched.filter((audit) => {
          if (audit.kind !== 'refund_review') return false;
          const laterPartial = partialAudits.find(
            (other) =>
              other.kind === 'partial_review' &&
              other.purchaseId != null &&
              other.purchaseId === audit.purchaseId &&
              (audit.recordedAt == null ||
                other.recordedAt == null ||
                other.recordedAt.getTime() >= audit.recordedAt.getTime()),
          );
          return !laterPartial;
        });
        const purchases = new Set(
          open.map((audit) => audit.purchaseId).filter((id) => id != null),
        );
        const anonymous = open.filter((audit) => audit.purchaseId == null).length;
        return Promise.resolve([{ n: purchases.size + anonymous }]);
      }
      const partials = matched.filter((audit) => audit.kind === 'partial_review');
      const known = partials.reduce(
        (sum, audit) =>
          audit.refundedAmount == null ? sum : sum.add(audit.refundedAmount),
        new Prisma.Decimal(0),
      );
      return Promise.resolve([
        {
          known,
          unknownCount: partials.filter((audit) => audit.refundedAmount == null)
            .length,
        },
      ]);
    },
  );

  prisma.creditPurchase.findMany.mockResolvedValue([]);
  prisma.creditPurchase.count.mockImplementation(() =>
    Promise.resolve(
      sales.filter(
        (sale) =>
          sale.status === 'PAID' &&
          sale.packageKey !== 'welcome' &&
          ['google_play', 'app_store', 'pix', 'card'].includes(
            sale.provider ?? '',
          ) &&
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
      card: 0,
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
      card: 0,
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

  it('cartão pago soma com PIX, Play e Apple; pendente, recusado e estornado ficam de fora', async () => {
    const prisma = createPrisma(
      [
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
        sale({
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
        sale({
          status: 'PENDING',
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: null,
        }),
        sale({
          status: 'FAILED',
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: null,
        }),
        sale({
          status: 'REFUNDED',
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.month.paidPurchases).toBe(4);
    expect(result.month.creditsSold).toBe(17);
    expect(result.month.grossRevenueBrl).toBe(374.9);
    expect(result.month.revenueByProvider).toEqual({
      google_play: 25,
      app_store: 200,
      pix: 115,
      card: 34.9,
    });
    expect(result.refundPosition.fullRefundsBrl).toBe(34.9);
    expect(result.month.grossRevenueBrl).toBe(374.9);
  });

  it('venda paga sem estorno preserva o faturamento e a receita', async () => {
    const prisma = createPrisma(
      [
        sale({
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.month.grossRevenueBrl).toBe(34.9);
    expect(result.month.paidPurchases).toBe(1);
    expect(result.refundPosition).toEqual({
      yearMonth: '2026-09',
      paidSalesBrl: 34.9,
      fullRefundsBrl: 0,
      partialRefundsBrl: 0,
      partialsWithoutAmount: 0,
      refundReviewsOpen: 0,
      revenueAfterRefundsBrl: 34.9,
      revenueComplete: true,
    });
    expect(result.history).toHaveLength(12);
    expect(result.totals).toEqual({ accounts: 0, users: 0, venues: 0 });
  });

  it('estorno total entra pelo valor original e não reduz a receita de novo', async () => {
    const prisma = createPrisma(
      [
        sale({
          provider: 'pix',
          packageKey: 'combo_5',
          credits: 5,
          amountPaid: new Prisma.Decimal(115),
          confirmedAt: septemberPaid,
        }),
        sale({
          status: 'REFUNDED',
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.month.grossRevenueBrl).toBe(115);
    expect(result.refundPosition.paidSalesBrl).toBe(115);
    expect(result.refundPosition.fullRefundsBrl).toBe(34.9);
    expect(result.refundPosition.revenueAfterRefundsBrl).toBe(115);
    expect(result.refundPosition.revenueComplete).toBe(true);
  });

  it('estorno parcial com valor conhecido reduz só a receita', async () => {
    const prisma = createPrisma(
      [
        sale({
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
      [
        {
          kind: 'partial_review',
          refundedAmount: new Prisma.Decimal('10.10'),
          status: 'PAID',
          packageKey: 'unit_1',
          provider: 'card',
          confirmedAt: septemberPaid,
        },
      ],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.month.grossRevenueBrl).toBe(34.9);
    expect(result.refundPosition.partialRefundsBrl).toBe(10.1);
    expect(result.refundPosition.revenueAfterRefundsBrl).toBe(24.8);
    expect(result.refundPosition.revenueComplete).toBe(true);
    expect(result.refundPosition.partialsWithoutAmount).toBe(0);
  });

  it('estorno parcial sem valor não vira zero e deixa a receita incompleta', async () => {
    const prisma = createPrisma(
      [
        sale({
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
      [
        {
          kind: 'partial_review',
          refundedAmount: null,
          status: 'PAID',
          packageKey: 'unit_1',
          provider: 'card',
          confirmedAt: septemberPaid,
        },
      ],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.refundPosition.partialRefundsBrl).toBe(0);
    expect(result.refundPosition.partialsWithoutAmount).toBe(1);
    expect(result.refundPosition.revenueAfterRefundsBrl).toBe(34.9);
    expect(result.refundPosition.revenueComplete).toBe(false);
  });

  it('parcial seguido de estorno total não soma o parcial de novo', async () => {
    const prisma = createPrisma(
      [
        sale({
          status: 'REFUNDED',
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
        sale({
          provider: 'pix',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
      [
        {
          kind: 'partial_review',
          refundedAmount: new Prisma.Decimal('10.00'),
          status: 'REFUNDED',
          packageKey: 'unit_1',
          provider: 'card',
          confirmedAt: septemberPaid,
        },
      ],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.month.grossRevenueBrl).toBe(34.9);
    expect(result.refundPosition.paidSalesBrl).toBe(34.9);
    expect(result.refundPosition.fullRefundsBrl).toBe(34.9);
    expect(result.refundPosition.partialRefundsBrl).toBe(0);
    expect(result.refundPosition.revenueAfterRefundsBrl).toBe(34.9);
    expect(result.refundPosition.revenueComplete).toBe(true);
  });

  it('reembolso de venda confirmada no mês anterior fica fora do mês atual', async () => {
    const prisma = createPrisma(
      [
        sale({
          status: 'REFUNDED',
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: augustPaid,
        }),
      ],
      [],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.month.grossRevenueBrl).toBe(0);
    expect(result.refundPosition.fullRefundsBrl).toBe(0);
    expect(result.refundPosition.paidSalesBrl).toBe(0);
    const august = result.history.find((row) => row.yearMonth === '2026-08');
    expect(august?.grossRevenueBrl).toBe(0);
  });

  it('limites do mês em America/Sao_Paulo separam agosto, setembro e outubro', async () => {
    const octoberStart = new Date('2026-10-01T03:00:00.000Z');
    const lastSeptemberInstant = new Date('2026-10-01T02:59:59.000Z');
    const prisma = createPrisma(
      [
        sale({
          status: 'REFUNDED',
          provider: 'pix',
          credits: 1,
          amountPaid: new Prisma.Decimal(25),
          confirmedAt: augustPaid,
        }),
        sale({
          status: 'REFUNDED',
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
        sale({
          status: 'REFUNDED',
          provider: 'google_play',
          credits: 1,
          amountPaid: new Prisma.Decimal(25),
          confirmedAt: lastSeptemberInstant,
        }),
        sale({
          status: 'REFUNDED',
          provider: 'app_store',
          credits: 10,
          amountPaid: new Prisma.Decimal(200),
          confirmedAt: octoberStart,
        }),
      ],
      [],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.refundPosition.yearMonth).toBe('2026-09');
    expect(result.refundPosition.fullRefundsBrl).toBe(59.9);
    expect(september.start.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(september.end.toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });

  it('soma PIX, cartão, Google Play e App Store no mesmo mês', async () => {
    const prisma = createPrisma(
      [
        sale({
          provider: 'pix',
          credits: 5,
          amountPaid: new Prisma.Decimal('149.90'),
          confirmedAt: septemberPaid,
        }),
        sale({
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
        sale({
          provider: 'google_play',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
        sale({
          status: 'REFUNDED',
          provider: 'app_store',
          credits: 10,
          amountPaid: new Prisma.Decimal('199.90'),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
      [
        {
          kind: 'partial_review',
          refundedAmount: new Prisma.Decimal('10.00'),
          status: 'PAID',
          packageKey: 'unit_1',
          provider: 'card',
          confirmedAt: septemberPaid,
        },
      ],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.month.revenueByProvider).toEqual({
      google_play: 34.9,
      app_store: 0,
      pix: 149.9,
      card: 34.9,
    });
    expect(result.refundPosition.paidSalesBrl).toBe(219.7);
    expect(result.refundPosition.fullRefundsBrl).toBe(199.9);
    expect(result.refundPosition.partialRefundsBrl).toBe(10);
    expect(result.refundPosition.revenueAfterRefundsBrl).toBe(209.7);
  });

  it('exclui welcome e compra sem confirmação dos reembolsos', async () => {
    const prisma = createPrisma(
      [
        sale({
          status: 'REFUNDED',
          packageKey: 'welcome',
          provider: 'pix',
          credits: 1,
          amountPaid: new Prisma.Decimal(25),
          confirmedAt: septemberPaid,
        }),
        sale({
          status: 'REFUNDED',
          provider: 'card',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: null,
        }),
        sale({
          provider: 'stub',
          credits: 1,
          amountPaid: new Prisma.Decimal(25),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
      [
        {
          kind: 'partial_review',
          refundedAmount: new Prisma.Decimal('10.00'),
          status: 'PAID',
          packageKey: 'welcome',
          provider: 'pix',
          confirmedAt: septemberPaid,
        },
        {
          kind: 'partial_review',
          refundedAmount: new Prisma.Decimal('10.00'),
          status: 'PAID',
          packageKey: 'unit_1',
          provider: 'card',
          confirmedAt: null,
        },
        {
          kind: 'shortfall',
          refundedAmount: new Prisma.Decimal('34.90'),
          status: 'PAID',
          packageKey: 'unit_1',
          provider: 'card',
          confirmedAt: septemberPaid,
        },
      ],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.month.grossRevenueBrl).toBe(0);
    expect(result.refundPosition).toEqual({
      yearMonth: '2026-09',
      paidSalesBrl: 0,
      fullRefundsBrl: 0,
      partialRefundsBrl: 0,
      partialsWithoutAmount: 0,
      refundReviewsOpen: 0,
      revenueAfterRefundsBrl: 0,
      revenueComplete: true,
    });
  });

  it('conta verificação de reembolso sem alterar parciais nem receita', async () => {
    const prisma = createPrisma(
      [
        sale({
          provider: 'card',
          packageKey: 'unit_1',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
      [
        {
          kind: 'refund_review',
          refundedAmount: null,
          status: 'PAID',
          packageKey: 'unit_1',
          provider: 'card',
          confirmedAt: septemberPaid,
          purchaseId: 'open-review',
        },
        {
          kind: 'partial_review',
          refundedAmount: new Prisma.Decimal('10.00'),
          status: 'PAID',
          packageKey: 'unit_1',
          provider: 'card',
          confirmedAt: septemberPaid,
          purchaseId: 'proven-partial',
        },
        {
          kind: 'refund_review',
          refundedAmount: null,
          status: 'PAID',
          packageKey: 'unit_1',
          provider: 'card',
          confirmedAt: septemberPaid,
          purchaseId: 'proven-partial',
        },
      ],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.refundPosition.partialRefundsBrl).toBe(10);
    expect(result.refundPosition.fullRefundsBrl).toBe(0);
    expect(result.refundPosition.paidSalesBrl).toBe(34.9);
    expect(result.refundPosition.revenueAfterRefundsBrl).toBe(24.9);
    expect(result.refundPosition.refundReviewsOpen).toBe(1);
    expect(result.refundPosition.revenueComplete).toBe(true);
  });

  it('conta revisão posterior ao parcial sem alterar a receita', async () => {
    const earlier = new Date('2026-09-02T12:00:00.000Z');
    const later = new Date('2026-09-04T12:00:00.000Z');
    const prisma = createPrisma(
      [
        sale({
          provider: 'card',
          packageKey: 'unit_1',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
        sale({
          provider: 'pix',
          packageKey: 'unit_1',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
      [
        {
          kind: 'partial_review',
          refundedAmount: new Prisma.Decimal('10.00'),
          status: 'PAID',
          packageKey: 'unit_1',
          provider: 'card',
          confirmedAt: septemberPaid,
          purchaseId: 'partial-then-review',
          recordedAt: earlier,
        },
        {
          kind: 'refund_review',
          refundedAmount: null,
          status: 'PAID',
          packageKey: 'unit_1',
          provider: 'card',
          confirmedAt: septemberPaid,
          purchaseId: 'partial-then-review',
          recordedAt: later,
        },
      ],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.refundPosition.paidSalesBrl).toBe(69.8);
    expect(result.refundPosition.partialRefundsBrl).toBe(10);
    expect(result.refundPosition.fullRefundsBrl).toBe(0);
    expect(result.refundPosition.revenueAfterRefundsBrl).toBe(59.8);
    expect(result.refundPosition.refundReviewsOpen).toBe(1);
  });

  it('separa revisão aberta, parcial posterior, período e compra repetida', async () => {
    const earlier = new Date('2026-09-02T12:00:00.000Z');
    const later = new Date('2026-09-04T12:00:00.000Z');
    const outsideAudit = new Date('2026-08-15T12:00:00.000Z');
    const review = (
      purchaseId: string,
      overrides: Partial<PartialAudit> = {},
    ): PartialAudit => ({
      kind: 'refund_review',
      refundedAmount: null,
      status: 'PAID',
      packageKey: 'unit_1',
      provider: 'card',
      confirmedAt: septemberPaid,
      purchaseId,
      recordedAt: earlier,
      ...overrides,
    });
    const partial = (
      purchaseId: string,
      recordedAt: Date,
    ): PartialAudit => ({
      kind: 'partial_review',
      refundedAmount: new Prisma.Decimal('10.00'),
      status: 'PAID',
      packageKey: 'unit_1',
      provider: 'card',
      confirmedAt: septemberPaid,
      purchaseId,
      recordedAt,
    });
    const prisma = createPrisma(
      [
        sale({
          provider: 'card',
          packageKey: 'unit_1',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
        sale({
          provider: 'pix',
          packageKey: 'unit_1',
          credits: 1,
          amountPaid: new Prisma.Decimal('34.90'),
          confirmedAt: septemberPaid,
        }),
      ],
      [],
      [
        partial('partial-then-review', earlier),
        review('partial-then-review', { recordedAt: later }),
        review('only-review'),
        partial('only-partial', earlier),
        review('review-then-partial'),
        partial('review-then-partial', later),
        review('refunded', { status: 'REFUNDED' }),
        review('other-month', { confirmedAt: augustPaid }),
        review('audit-outside-purchase-inside', { recordedAt: outsideAudit }),
        review('same-purchase'),
        review('same-purchase', { recordedAt: later }),
        review('other-venue'),
        review('welcome', { packageKey: 'welcome' }),
        review('stub', { provider: 'stub' }),
      ],
    );
    const service = new AdminDashboardService(prisma as never);
    const result = await service.getDashboard(now);

    expect(result.refundPosition.paidSalesBrl).toBe(69.8);
    expect(result.refundPosition.partialRefundsBrl).toBe(30);
    expect(result.refundPosition.fullRefundsBrl).toBe(0);
    expect(result.refundPosition.revenueAfterRefundsBrl).toBe(39.8);
    expect(result.refundPosition.refundReviewsOpen).toBe(5);
  });
});
