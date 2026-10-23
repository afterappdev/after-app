import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import {
  REAL_SALE_PROVIDERS,
  buildRefundPosition,
  isRealSaleProvider,
  openRefundReviewsInRange,
  partialRefundsInRange,
  realSaleWhere,
  saleHistoryWhere,
  summarizeProviderGroups,
} from './finance';
import { AdminSalesQueryDto } from './sales/admin-sales.query';

describe('vendas reais com cartão', () => {
  it('inclui card sem remover PIX, Google Play e App Store', () => {
    expect(REAL_SALE_PROVIDERS).toEqual([
      'google_play',
      'app_store',
      'pix',
      'card',
    ]);
    expect(realSaleWhere.status).toBe('PAID');
    expect(realSaleWhere.confirmedAt).toEqual({ not: null });
    expect(saleHistoryWhere.status).toEqual({ in: ['PAID', 'REFUNDED'] });
    expect(saleHistoryWhere.confirmedAt).toEqual({ not: null });
    expect(isRealSaleProvider('card')).toBe(true);
    expect(isRealSaleProvider('pix')).toBe(true);
    expect(isRealSaleProvider('stub')).toBe(false);
  });

  it('soma provedores pagos e ignora grupo desconhecido', () => {
    const summary = summarizeProviderGroups([
      {
        provider: 'pix',
        _count: { _all: 1 },
        _sum: { credits: 5, amountPaid: new Prisma.Decimal(115) },
      },
      {
        provider: 'google_play',
        _count: { _all: 1 },
        _sum: { credits: 1, amountPaid: new Prisma.Decimal(25) },
      },
      {
        provider: 'app_store',
        _count: { _all: 1 },
        _sum: { credits: 10, amountPaid: new Prisma.Decimal(200) },
      },
      {
        provider: 'card',
        _count: { _all: 1 },
        _sum: { credits: 1, amountPaid: new Prisma.Decimal('34.90') },
      },
      {
        provider: 'stub',
        _count: { _all: 1 },
        _sum: { credits: 9, amountPaid: new Prisma.Decimal(99) },
      },
    ]);

    expect(summary.purchases).toBe(4);
    expect(summary.credits).toBe(17);
    expect(summary.grossRevenueBrl).toBe(374.9);
    expect(summary.byProvider).toEqual({
      google_play: 25,
      app_store: 200,
      pix: 115,
      card: 34.9,
    });
  });

  it('aceita o filtro de cartão no histórico de vendas', async () => {
    const dto = new AdminSalesQueryDto();
    dto.provider = 'card';
    expect(await validate(dto)).toHaveLength(0);

    const rejected = new AdminSalesQueryDto();
    rejected.provider = 'stub' as never;
    expect(await validate(rejected)).not.toHaveLength(0);
  });

  it('aceita Todas, Pagas e Reembolsadas e recusa status de venda recusada', async () => {
    for (const status of ['all', 'paid', 'refunded'] as const) {
      const dto = new AdminSalesQueryDto();
      dto.status = status;
      expect(await validate(dto)).toHaveLength(0);
    }
    const rejected = new AdminSalesQueryDto();
    rejected.status = 'failed' as never;
    expect(await validate(rejected)).not.toHaveLength(0);
  });

  it('receita desconta o parcial conhecido e preserva o estorno total à parte', () => {
    const position = buildRefundPosition({
      yearMonth: '2026-09',
      paid: new Prisma.Decimal('184.80'),
      fullRefunds: new Prisma.Decimal('34.90'),
      partialKnown: new Prisma.Decimal('10.10'),
      partialsWithoutAmount: 0,
    });

    expect(position.paidSalesBrl).toBe(184.8);
    expect(position.fullRefundsBrl).toBe(34.9);
    expect(position.partialRefundsBrl).toBe(10.1);
    expect(position.revenueAfterRefundsBrl).toBe(174.7);
    expect(position.revenueComplete).toBe(true);
  });

  it('parcial sem valor mantém a receita incompleta', () => {
    const position = buildRefundPosition({
      yearMonth: '2026-09',
      paid: new Prisma.Decimal('34.90'),
      fullRefunds: new Prisma.Decimal(0),
      partialKnown: new Prisma.Decimal(0),
      partialsWithoutAmount: 2,
    });

    expect(position.partialRefundsBrl).toBe(0);
    expect(position.partialsWithoutAmount).toBe(2);
    expect(position.revenueAfterRefundsBrl).toBe(34.9);
    expect(position.revenueComplete).toBe(false);
  });

  it('totais do cartão não leem o marcador pix_partial_review', async () => {
    const queries: string[] = [];
    const prisma = {
      $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
        queries.push(Array.from(strings).join(' '));
        return [{ known: 0, unknownCount: 0, n: 0 }];
      }),
    };
    const start = new Date('2026-10-01T03:00:00.000Z');
    const end = new Date('2026-11-01T03:00:00.000Z');

    await partialRefundsInRange(prisma as never, start, end);
    await openRefundReviewsInRange(prisma as never, start, end);

    const sql = queries.join('\n');
    expect(sql).toContain("kind = 'partial_review'");
    expect(sql).toContain("kind = 'refund_review'");
    expect(sql).not.toContain('pix_partial_review');
  });
});
