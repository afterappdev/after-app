import { CREDIT_PACKAGES } from '../common/constants/credits';
import { VipCreditsService } from './vip-credits.service';
import {
  VIP_WEB_PACKAGE_KEY,
  VIP_WEB_PRICE_BRL,
  VIP_WEB_PRODUCT_ID,
  WEB_CREDIT_PACKAGE_KEYS,
  decideVipSettlement,
  futureVipBenefitRevoked,
  planVipPurchaseClawback,
  vipGrantOperationKey,
  vipRefundOperationKey,
  webSaleByKey,
} from './vip-web-checkout';

const vipPurchase = {
  status: 'PENDING',
  packageKey: VIP_WEB_PACKAGE_KEY,
  productId: VIP_WEB_PRODUCT_ID,
  credits: 1,
  amountPaid: VIP_WEB_PRICE_BRL,
};

function memory() {
  const wallets = new Map<string, { balance: number; vipBalance: number }>();
  const entries: Array<{ operationKey: string; balanceDelta: number; kind: string }> = [];
  const prisma = {
    $transaction: async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    creditWallet: {
      findUnique: async ({ where }: { where: { venueId: string } }) =>
        wallets.get(where.venueId) ?? null,
      create: async ({
        data,
      }: {
        data: { venueId: string; balance: number; vipBalance: number };
      }) => {
        wallets.set(data.venueId, {
          balance: data.balance,
          vipBalance: data.vipBalance,
        });
        return wallets.get(data.venueId);
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { venueId: string };
        create: { venueId: string; balance: number; vipBalance: number };
        update: { vipBalance: { increment: number } };
      }) => {
        const current = wallets.get(where.venueId);
        if (!current) {
          wallets.set(create.venueId, {
            balance: create.balance,
            vipBalance: create.vipBalance,
          });
        } else {
          current.vipBalance += update.vipBalance.increment;
        }
        return wallets.get(where.venueId);
      },
    },
    vipCreditEntry: {
      findUnique: async ({ where }: { where: { operationKey: string } }) =>
        entries.find((item) => item.operationKey === where.operationKey) ?? null,
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: { operationKey: string; balanceDelta: number; kind: string };
        skipDuplicates?: boolean;
      }) => {
        if (
          skipDuplicates &&
          entries.some((item) => item.operationKey === data.operationKey)
        ) {
          return { count: 0 };
        }
        entries.push(data);
        return { count: 1 };
      },
    },
  };
  return { wallets, entries, service: new VipCreditsService(prisma as never) };
}

describe('checkout VIP web', () => {
  it('preserva o preço dos pacotes comuns e cobra 99,90 no VIP', () => {
    expect(webSaleByKey('unit_1')).toMatchObject({
      priceBrl: 34.9,
      credits: 1,
      modality: 'COMMON',
      productId: null,
    });
    expect(webSaleByKey('combo_5')?.priceBrl).toBe(149.9);
    expect(webSaleByKey('combo_10')?.priceBrl).toBe(199.9);
    expect(webSaleByKey(VIP_WEB_PACKAGE_KEY)).toEqual({
      key: VIP_WEB_PACKAGE_KEY,
      credits: 1,
      priceBrl: 99.9,
      productId: VIP_WEB_PRODUCT_ID,
      modality: 'VIP',
    });
    expect(CREDIT_PACKAGES.map((item) => item.key)).not.toContain(VIP_WEB_PACKAGE_KEY);
    expect(WEB_CREDIT_PACKAGE_KEYS).toContain(VIP_WEB_PACKAGE_KEY);
    expect(CREDIT_PACKAGES.map((item) => item.storeProductId)).not.toContain(
      VIP_WEB_PRODUCT_ID,
    );
  });

  it('webhook duplicado e polling simultâneo creditam uma vez só o vipBalance', async () => {
    const { wallets, service } = memory();
    wallets.set('venue-1', { balance: 4, vipBalance: 0 });
    let status = 'PENDING';
    const key = vipGrantOperationKey('purchase-1');

    async function confirm() {
      const effect = decideVipSettlement({
        ...vipPurchase,
        status,
        next: 'PAID',
        orderAmountBrl: 99.9,
      });
      if (effect !== 'grant' || status !== 'PENDING') return effect;
      status = 'PAID';
      await service.grant({ venueId: 'venue-1', operationKey: key, credits: 1 });
      return effect;
    }

    const [first, second] = await Promise.all([confirm(), confirm()]);
    expect([first, second].filter((item) => item === 'grant')).toHaveLength(1);
    expect(wallets.get('venue-1')).toEqual({ balance: 4, vipBalance: 1 });

    const replay = await service.grant({
      venueId: 'venue-1',
      operationKey: key,
      credits: 1,
    });
    expect(replay.applied).toBe(false);
    expect(wallets.get('venue-1')?.vipBalance).toBe(1);
    expect(wallets.get('venue-1')?.balance).toBe(4);
  });

  it('falha posterior a um pagamento aprovado não mexe nas carteiras', () => {
    expect(
      decideVipSettlement({
        ...vipPurchase,
        status: 'PAID',
        next: 'FAILED',
        orderAmountBrl: 99.9,
      }),
    ).toBe('keep');
    expect(
      decideVipSettlement({
        ...vipPurchase,
        status: 'PAID',
        next: 'CANCELLED',
      }),
    ).toBe('keep');
  });

  it('reembolso integral e chargeback devolvem só crédito VIP não usado', async () => {
    const { wallets, service } = memory();
    wallets.set('venue-1', { balance: 4, vipBalance: 1 });
    expect(
      decideVipSettlement({ ...vipPurchase, status: 'PAID', next: 'REFUNDED' }),
    ).toBe('refund');
    expect(
      decideVipSettlement({
        ...vipPurchase,
        status: 'PAID',
        next: 'CHARGED_BACK',
      }),
    ).toBe('refund');

    const refunded = await service.refund({
      venueId: 'venue-1',
      operationKey: vipRefundOperationKey('purchase-1'),
      credits: 1,
    });
    expect(refunded).toMatchObject({ applied: true, vipBalance: 0, balanceDelta: -1 });
    expect(wallets.get('venue-1')).toEqual({ balance: 4, vipBalance: 0 });

    const again = await service.refund({
      venueId: 'venue-1',
      operationKey: vipRefundOperationKey('purchase-1'),
      credits: 1,
    });
    expect(again.applied).toBe(false);
    expect(wallets.get('venue-1')).toEqual({ balance: 4, vipBalance: 0 });
  });

  it('crédito VIP já consumido não debita o saldo comum', async () => {
    const { wallets, service } = memory();
    wallets.set('venue-1', { balance: 4, vipBalance: 0 });
    const refunded = await service.refund({
      venueId: 'venue-1',
      operationKey: vipRefundOperationKey('purchase-spent'),
      credits: 1,
    });
    expect(refunded).toMatchObject({ applied: true, vipBalance: 0, balanceDelta: 0 });
    expect(wallets.get('venue-1')).toEqual({ balance: 4, vipBalance: 0 });
  });

  it('pagamento confirmado depois do cancelamento local ainda credita uma vez', () => {
    expect(
      decideVipSettlement({
        ...vipPurchase,
        status: 'CANCELLED',
        next: 'PAID',
        orderAmountBrl: 99.9,
      }),
    ).toBe('grant');
    expect(
      decideVipSettlement({
        ...vipPurchase,
        status: 'FAILED',
        next: 'PAID',
        orderAmountBrl: 99.9,
      }),
    ).toBe('ignore');
    expect(
      decideVipSettlement({
        ...vipPurchase,
        status: 'PAID',
        next: 'PAID',
        orderAmountBrl: 99.9,
      }),
    ).toBe('ignore');
  });

  it('estorno não retira crédito de outra compra e repete sem novo débito', () => {
    const grant = (id: string, at: string) => ({
      operationKey: `vip:purchase:${id}:grant`,
      kind: 'grant',
      credits: 1,
      balanceDelta: 1,
      createdAt: at,
    });
    const consume = (scheduleId: string, at: string) => ({
      operationKey: `vip-consume:${scheduleId}`,
      kind: 'consume',
      credits: 1,
      balanceDelta: -1,
      createdAt: at,
      scheduleId,
    });
    const held = [
      grant('older', '2026-10-01T12:00:00.000Z'),
      grant('newer', '2026-10-02T12:00:00.000Z'),
    ];
    expect(
      planVipPurchaseClawback({ purchaseId: 'older', vipBalance: 2, entries: held }),
    ).toEqual({ recover: 1, unrecovered: 0, scheduleId: null });
    const afterConsume = [
      ...held,
      consume('sched-old', '2026-10-03T12:00:00.000Z'),
    ];
    expect(
      planVipPurchaseClawback({
        purchaseId: 'older',
        vipBalance: 1,
        entries: afterConsume,
      }),
    ).toEqual({ recover: 0, unrecovered: 1, scheduleId: 'sched-old' });
    expect(
      planVipPurchaseClawback({
        purchaseId: 'newer',
        vipBalance: 1,
        entries: afterConsume,
      }),
    ).toEqual({ recover: 1, unrecovered: 0, scheduleId: null });
    const clawed = [
      ...afterConsume,
      {
        operationKey: 'vip:purchase:newer:refund',
        kind: 'refund',
        credits: 1,
        balanceDelta: -1,
        createdAt: '2026-10-04T12:00:00.000Z',
      },
    ];
    expect(
      planVipPurchaseClawback({ purchaseId: 'newer', vipBalance: 0, entries: clawed }),
    ).toEqual({ recover: 0, unrecovered: 0, scheduleId: null });
    expect(
      planVipPurchaseClawback({ purchaseId: 'older', vipBalance: 0, entries: clawed }),
    ).toEqual({ recover: 0, unrecovered: 1, scheduleId: 'sched-old' });
  });

  it('benefício VIP futuro é revogado e o dia corrente permanece', () => {
    expect(
      futureVipBenefitRevoked(new Date('2026-10-22T00:00:00.000Z'), '2026-10-21'),
    ).toBe(true);
    expect(
      futureVipBenefitRevoked(new Date('2026-10-21T00:00:00.000Z'), '2026-10-21'),
    ).toBe(false);
  });

  it('valor ou produto divergente não credita nenhuma carteira', () => {
    expect(
      decideVipSettlement({
        ...vipPurchase,
        next: 'PAID',
        orderAmountBrl: 34.9,
      }),
    ).toBe('reject');
    expect(
      decideVipSettlement({
        ...vipPurchase,
        productId: 'after.credits.1',
        next: 'PAID',
        orderAmountBrl: 99.9,
      }),
    ).toBe('reject');
    expect(
      decideVipSettlement({
        ...vipPurchase,
        amountPaid: 34.9,
        next: 'PAID',
        orderAmountBrl: 99.9,
      }),
    ).toBe('reject');
    expect(
      decideVipSettlement({
        ...vipPurchase,
        next: 'PAID',
        orderAmountBrl: null,
      }),
    ).toBe('reject');
    expect(
      decideVipSettlement({
        status: 'PENDING',
        packageKey: 'unit_1',
        productId: 'after.credits.1',
        credits: 1,
        amountPaid: 34.9,
        next: 'PAID',
        orderAmountBrl: 34.9,
      }),
    ).toBe('ignore');
  });
});
