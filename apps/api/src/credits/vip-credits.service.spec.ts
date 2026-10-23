import { CREDIT_PACKAGES } from '../common/constants/credits';
import { VIP_CREDIT_PACKAGES } from './vip-catalog';
import { VipCreditsService } from './vip-credits.service';

type Entry = {
  venueId: string;
  operationKey: string;
  kind: string;
  credits: number;
  balanceDelta: number;
};

function memory() {
  const wallets = new Map<string, { balance: number; vipBalance: number }>();
  const entries: Entry[] = [];
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
        data: Entry;
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

describe('VipCreditsService', () => {
  it('compra um crédito VIP sem mexer no saldo comum', async () => {
    const { wallets, service } = memory();
    wallets.set('venue-1', { balance: 4, vipBalance: 0 });
    const granted = await service.grant({
      venueId: 'venue-1',
      operationKey: 'vip-purchase:order-1',
      credits: 1,
    });
    expect(granted).toEqual({ applied: true, vipBalance: 1, balanceDelta: 1 });
    expect(wallets.get('venue-1')).toEqual({ balance: 4, vipBalance: 1 });
  });

  it('a mesma compra não credita duas vezes', async () => {
    const { wallets, service } = memory();
    const input = {
      venueId: 'venue-1',
      operationKey: 'vip-purchase:order-1',
      credits: 1,
    };
    await service.grant(input);
    const again = await service.grant(input);
    expect(again.applied).toBe(false);
    expect(wallets.get('venue-1')?.vipBalance).toBe(1);
  });

  it('reembolso não deixa o saldo VIP negativo e é idempotente', async () => {
    const { wallets, service } = memory();
    await service.grant({
      venueId: 'venue-1',
      operationKey: 'vip-purchase:order-1',
      credits: 1,
    });
    const refunded = await service.refund({
      venueId: 'venue-1',
      operationKey: 'vip-refund:order-1',
      credits: 3,
    });
    expect(refunded).toEqual({ applied: true, vipBalance: 0, balanceDelta: -1 });
    const repeated = await service.refund({
      venueId: 'venue-1',
      operationKey: 'vip-refund:order-1',
      credits: 3,
    });
    expect(repeated.applied).toBe(false);
    expect(wallets.get('venue-1')?.vipBalance).toBe(0);
    expect(wallets.get('venue-1')?.balance).toBe(0);
  });

  it('o catálogo VIP não reutiliza produto comum', () => {
    const commonIds = CREDIT_PACKAGES.map((item) => item.storeProductId);
    expect(VIP_CREDIT_PACKAGES).toEqual([
      expect.objectContaining({
        key: 'vip_unit_1',
        modality: 'VIP',
        credits: 1,
        referencePriceBrl: 99.9,
        storeProductId: 'after.credits.vip.1',
        storePriceBrl: null,
      }),
    ]);
    expect(commonIds).not.toContain('after.credits.vip.1');
    expect(CREDIT_PACKAGES.map((item) => item.priceBrl)).toEqual([34.9, 149.9, 199.9]);
  });
});
