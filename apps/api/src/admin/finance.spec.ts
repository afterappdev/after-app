import { Prisma } from '@prisma/client';
import {
  REAL_SALE_PROVIDERS,
  isRealSaleProvider,
  realSaleWhere,
  summarizeProviderGroups,
} from './finance';

describe('provedores de venda real', () => {
  it('inclui cartão e mantém PIX, Google Play e Apple', () => {
    expect(REAL_SALE_PROVIDERS).toEqual([
      'google_play',
      'app_store',
      'pix',
      'card',
    ]);
    expect(realSaleWhere).toEqual({
      status: 'PAID',
      packageKey: { not: 'welcome' },
      provider: { in: ['google_play', 'app_store', 'pix', 'card'] },
      confirmedAt: { not: null },
    });
    expect(isRealSaleProvider('card')).toBe(true);
    expect(isRealSaleProvider('pix')).toBe(true);
    expect(isRealSaleProvider('google_play')).toBe(true);
    expect(isRealSaleProvider('app_store')).toBe(true);
    expect(isRealSaleProvider('stub')).toBe(false);
    expect(isRealSaleProvider(null)).toBe(false);
  });

  it('soma cartão pago e ignora grupo fora da lista', () => {
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
});
