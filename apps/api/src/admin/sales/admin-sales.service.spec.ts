import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

type Audit = {
  purchaseId: string;
  kind: string;
  creditsRecovered: number | null;
  creditsUnrecovered: number | null;
  refundedAmount: string | null;
  refundId: string | null;
  createdAt: Date;
};

const venue = { id: 'venue-1', name: 'Bar', city: 'São Paulo', state: 'SP' };
const confirmed = new Date('2026-10-01T15:00:00.000Z');

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'sale-1',
    packageKey: 'unit_1',
    credits: 1,
    amountPaid: new Prisma.Decimal('34.90'),
    currency: 'BRL',
    provider: 'card',
    status: 'PAID',
    confirmedAt: confirmed,
    createdAt: confirmed,
    venueId: venue.id,
    venue,
    ...overrides,
  };
}

function matches(row: Purchase, where: Record<string, any>): boolean {
  if (where.id && row.id !== where.id) return false;
  const status = where.status;
  if (typeof status === 'string' && row.status !== status) return false;
  if (status?.in && !status.in.includes(row.status)) return false;
  if (where.packageKey?.not && row.packageKey === where.packageKey.not) return false;
  const provider = where.provider;
  if (typeof provider === 'string' && row.provider !== provider) return false;
  if (provider?.in && !provider.in.includes(row.provider ?? '')) return false;
  const at = where.confirmedAt;
  if (at?.not === null && row.confirmedAt == null) return false;
  if (at?.gte && (row.confirmedAt == null || row.confirmedAt < at.gte)) return false;
  if (at?.lt && (row.confirmedAt == null || row.confirmedAt >= at.lt)) return false;
  return true;
}

function collectStrings(value: unknown, out: string[]) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectStrings(item, out),
    );
  }
}

function createPrisma(rows: Purchase[], audits: Audit[] = []) {
  const queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = Array.from(strings).join(' ');
    if (!sql.includes('CreditRefundAudit')) return [];
    const ids: string[] = [];
    values.forEach((value) => collectStrings(value, ids));
    return audits.filter((audit) => ids.includes(audit.purchaseId));
  });
  const prisma = {
    creditPurchase: {
      count: jest.fn(async ({ where }: { where: Record<string, any> }) =>
        rows.filter((row) => matches(row, where)).length,
      ),
      findMany: jest.fn(
        async ({
          where,
          skip = 0,
          take,
        }: {
          where: Record<string, any>;
          skip?: number;
          take?: number;
        }) => {
          const found = rows
            .filter((row) => matches(row, where))
            .sort(
              (a, b) =>
                (b.confirmedAt?.getTime() ?? 0) - (a.confirmedAt?.getTime() ?? 0),
            );
          return found.slice(skip, take == null ? undefined : skip + take);
        },
      ),
      findFirst: jest.fn(async ({ where }: { where: Record<string, any> }) =>
        rows.find((row) => matches(row, where)) ?? null,
      ),
    },
    $queryRaw: queryRaw,
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return prisma;
}

describe('histórico administrativo de vendas', () => {
  const rows = [
    purchase(),
    purchase({
      id: 'refunded',
      status: 'REFUNDED',
      confirmedAt: new Date('2026-10-02T15:00:00.000Z'),
    }),
    purchase({
      id: 'partial',
      confirmedAt: new Date('2026-10-03T15:00:00.000Z'),
    }),
    purchase({
      id: 'pix',
      provider: 'pix',
      amountPaid: new Prisma.Decimal('149.90'),
      credits: 5,
    }),
    purchase({ id: 'failed', status: 'FAILED', confirmedAt: null }),
    purchase({ id: 'pending', status: 'PENDING', confirmedAt: null }),
    purchase({ id: 'cancelled', status: 'CANCELLED', confirmedAt: confirmed }),
    purchase({ id: 'welcome', packageKey: 'welcome', amountPaid: new Prisma.Decimal(0) }),
  ];
  const audits: Audit[] = [
    {
      purchaseId: 'refunded',
      kind: 'shortfall',
      creditsRecovered: 2,
      creditsUnrecovered: 3,
      refundedAmount: null,
      refundId: 'REF-TOTAL',
      createdAt: new Date('2026-10-04T12:00:00.000Z'),
    },
    {
      purchaseId: 'partial',
      kind: 'partial_review',
      creditsRecovered: null,
      creditsUnrecovered: null,
      refundedAmount: '10.00',
      refundId: null,
      createdAt: new Date('2026-10-04T13:00:00.000Z'),
    },
  ];

  function service() {
    const prisma = createPrisma(rows, audits);
    return { service: new AdminSalesService(prisma as never), prisma };
  }

  it('lista pagas e reembolsadas e deixa recusadas de fora', async () => {
    const { service: sales, prisma } = service();
    const page = await sales.list({});
    const ids = page.items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['sale-1', 'refunded', 'partial', 'pix']));
    expect(ids).not.toContain('failed');
    expect(ids).not.toContain('pending');
    expect(ids).not.toContain('cancelled');
    expect(ids).not.toContain('welcome');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('filtra Todas, Pagas e Reembolsadas', async () => {
    const { service: sales } = service();
    const all = await sales.list({ status: 'all' });
    const paid = await sales.list({ status: 'paid' });
    const refunded = await sales.list({ status: 'refunded' });
    expect(all.items.map((item) => item.status)).toEqual(
      expect.arrayContaining(['PAID', 'REFUNDED']),
    );
    expect(paid.items.every((item) => item.status === 'PAID')).toBe(true);
    expect(paid.items.map((item) => item.id)).toContain('partial');
    expect(refunded.items).toEqual([
      expect.objectContaining({ id: 'refunded', status: 'REFUNDED' }),
    ]);
  });

  it('filtra cartão de crédito sem trazer PIX', async () => {
    const { service: sales } = service();
    const page = await sales.list({ provider: 'card' });
    expect(page.items.every((item) => item.provider === 'card')).toBe(true);
    expect(page.items.map((item) => item.id)).not.toContain('pix');
  });

  it('pagina o histórico', async () => {
    const { service: sales } = service();
    const first = await sales.list({ provider: 'card', limit: 2, page: 1 });
    const second = await sales.list({ provider: 'card', limit: 2, page: 2 });
    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(first.totalPages).toBe(2);
  });

  it('estorno total com auditoria expõe só os campos gravados', async () => {
    const { service: sales } = service();
    const detail = await sales.getById('refunded');
    expect(detail.status).toBe('REFUNDED');
    expect(detail.amountPaid).toBe(34.9);
    expect(detail.credits).toBe(1);
    expect(detail.refundKinds).toEqual(['shortfall']);
    expect(detail.refundAudits).toEqual([
      {
        kind: 'shortfall',
        recordedAt: '2026-10-04T12:00:00.000Z',
        creditsRecovered: 2,
        creditsUnrecovered: 3,
        refundId: 'REF-TOTAL',
      },
    ]);
    expect(detail.refundAudits[0]).not.toHaveProperty('refundedAmount');
  });

  it('estorno total sem auditoria não inventa recuperação nem valor', async () => {
    const bare = purchase({
      id: 'bare-refund',
      status: 'REFUNDED',
    });
    const prisma = createPrisma([bare], []);
    const sales = new AdminSalesService(prisma as never);
    const detail = await sales.getById('bare-refund');
    expect(detail.status).toBe('REFUNDED');
    expect(detail.amountPaid).toBe(34.9);
    expect(detail.credits).toBe(1);
    expect(detail.refundKinds).toEqual([]);
    expect(detail.refundAudits).toEqual([]);
  });

  it('estorno parcial permanece pago e omite campos ausentes', async () => {
    const { service: sales } = service();
    const detail = await sales.getById('partial');
    expect(detail.status).toBe('PAID');
    expect(detail.refundKinds).toEqual(['partial_review']);
    expect(detail.refundAudits).toEqual([
      {
        kind: 'partial_review',
        recordedAt: '2026-10-04T13:00:00.000Z',
        refundedAmount: 10,
      },
    ]);
    expect(detail.refundAudits[0]).not.toHaveProperty('creditsRecovered');
    expect(detail.refundAudits[0]).not.toHaveProperty('creditsUnrecovered');
    expect(detail.refundAudits[0]).not.toHaveProperty('refundId');
  });

  it('compra recusada não abre detalhe', async () => {
    const { service: sales } = service();
    await expect(sales.getById('failed')).rejects.toBeInstanceOf(NotFoundException);
  });
});
