import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { REAL_SALE_PROVIDERS, realSaleWhere } from '../finance';
import { inclusiveDateRangeUtc } from '../timezone';
import { AdminSalesQueryDto } from './admin-sales.query';
import { AdminSalesService } from './admin-sales.service';

type Purchase = {
  id: string;
  packageKey: string;
  credits: number;
  amountPaid: Prisma.Decimal;
  currency: string;
  provider: string | null;
  status: string;
  confirmedAt: Date | null;
  createdAt: Date;
  venueId: string;
  venue: { id: string; name: string; city: string; state: string };
};

const venue = { id: 'venue-1', name: 'Bar', city: 'São Paulo', state: 'SP' };
const septemberPaid = new Date('2026-09-01T03:00:00.000Z');
const augustPaid = new Date('2026-09-01T02:59:59.000Z');

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'sale-1',
    packageKey: 'unit_1',
    credits: 1,
    amountPaid: new Prisma.Decimal('34.90'),
    currency: 'BRL',
    provider: 'card',
    status: 'PAID',
    confirmedAt: septemberPaid,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    venueId: venue.id,
    venue,
    ...overrides,
  };
}

function matches(
  row: Purchase,
  where: {
    id?: string;
    status?: string;
    packageKey?: { not?: string };
    provider?: string | { in?: string[] };
    confirmedAt?: { not?: null; gte?: Date; lt?: Date };
  },
) {
  if (where.id && row.id !== where.id) return false;
  if (where.status && row.status !== where.status) return false;
  if (where.packageKey?.not && row.packageKey === where.packageKey.not) {
    return false;
  }
  if (typeof where.provider === 'string' && row.provider !== where.provider) {
    return false;
  }
  if (
    where.provider &&
    typeof where.provider !== 'string' &&
    where.provider.in &&
    !where.provider.in.includes(row.provider ?? '')
  ) {
    return false;
  }
  if (where.confirmedAt?.not === null && row.confirmedAt == null) return false;
  if (
    where.confirmedAt?.gte &&
    (row.confirmedAt == null || row.confirmedAt < where.confirmedAt.gte)
  ) {
    return false;
  }
  if (
    where.confirmedAt?.lt &&
    (row.confirmedAt == null || row.confirmedAt >= where.confirmedAt.lt)
  ) {
    return false;
  }
  return true;
}

function createPrisma(rows: Purchase[]) {
  const findMany = jest.fn(
    async ({
      where,
      skip = 0,
      take,
    }: {
      where: Parameters<typeof matches>[1];
      skip?: number;
      take?: number;
    }) =>
      rows
        .filter((row) => matches(row, where))
        .sort(
          (a, b) =>
            (b.confirmedAt?.getTime() ?? 0) - (a.confirmedAt?.getTime() ?? 0),
        )
        .slice(skip, take == null ? undefined : skip + take),
  );
  const count = jest.fn(
    async ({ where }: { where: Parameters<typeof matches>[1] }) =>
      rows.filter((row) => matches(row, where)).length,
  );
  const findFirst = jest.fn(
    async ({ where }: { where: Parameters<typeof matches>[1] }) =>
      rows.find((row) => matches(row, where)) ?? null,
  );
  return {
    creditPurchase: { findMany, count, findFirst },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    findMany,
  };
}

describe('histórico administrativo de vendas', () => {
  const rows = [
    purchase(),
    purchase({
      id: 'pix',
      provider: 'pix',
      amountPaid: new Prisma.Decimal(115),
      credits: 5,
    }),
    purchase({
      id: 'play',
      provider: 'google_play',
      amountPaid: new Prisma.Decimal(25),
    }),
    purchase({
      id: 'apple',
      provider: 'app_store',
      amountPaid: new Prisma.Decimal(200),
      credits: 10,
    }),
    purchase({ id: 'pending', status: 'PENDING', confirmedAt: null }),
    purchase({ id: 'failed', status: 'FAILED', confirmedAt: null }),
    purchase({ id: 'cancelled', status: 'CANCELLED', confirmedAt: septemberPaid }),
    purchase({
      id: 'refunded',
      status: 'REFUNDED',
      confirmedAt: septemberPaid,
    }),
    purchase({
      id: 'welcome',
      packageKey: 'welcome',
      amountPaid: new Prisma.Decimal(0),
    }),
    purchase({
      id: 'august-card',
      confirmedAt: augustPaid,
      amountPaid: new Prisma.Decimal('49.90'),
    }),
  ];

  function service() {
    const prisma = createPrisma(rows);
    return { sales: new AdminSalesService(prisma as never), prisma };
  }

  it('usa a mesma lista de provedores do dashboard', () => {
    expect(realSaleWhere.provider).toEqual({ in: [...REAL_SALE_PROVIDERS] });
    expect(REAL_SALE_PROVIDERS).toEqual([
      'google_play',
      'app_store',
      'pix',
      'card',
    ]);
  });

  it('aceita o filtro de cartão e recusa provedor fora da lista', async () => {
    const dto = new AdminSalesQueryDto();
    dto.provider = 'card';
    expect(await validate(dto)).toHaveLength(0);

    const rejected = new AdminSalesQueryDto();
    rejected.provider = 'stub' as never;
    expect(await validate(rejected)).not.toHaveLength(0);
  });

  it('lista cartão, PIX, Play e Apple pagos e deixa pendente, recusado, cancelado e estorno de fora', async () => {
    const { sales } = service();
    const page = await sales.list({});
    const ids = page.items.map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining(['sale-1', 'pix', 'play', 'apple', 'august-card']),
    );
    expect(ids).not.toContain('pending');
    expect(ids).not.toContain('failed');
    expect(ids).not.toContain('cancelled');
    expect(ids).not.toContain('refunded');
    expect(ids).not.toContain('welcome');
  });

  it('filtra cartão e o mês por confirmedAt em America/Sao_Paulo', async () => {
    const { sales, prisma } = service();
    const page = await sales.list({
      provider: 'card',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(page.items.map((item) => item.id)).toEqual(['sale-1']);
    expect(page.items[0].amountPaid).toBe(34.9);

    const range = inclusiveDateRangeUtc('2026-09-01', '2026-09-30');
    const where = prisma.findMany.mock.calls[0][0].where;
    expect(where.provider).toBe('card');
    expect(where.status).toBe('PAID');
    expect(where.confirmedAt.gte).toEqual(range.start);
    expect(where.confirmedAt.lt).toEqual(range.end);
    expect(where.confirmedAt.not).toBeNull();
  });

  it('não abre detalhe de estorno total', async () => {
    const { sales } = service();
    await expect(sales.getById('refunded')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const detail = await sales.getById('sale-1');
    expect(detail.provider).toBe('card');
    expect(detail.status).toBe('PAID');
  });
});
