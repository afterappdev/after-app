import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  CardObserveStopped,
  observeCardReconciliation,
  prismaCardObserveDb,
} from '../src/credits/card-reconcile-observe';

const TEST_DATABASE = 'after_refund_tx';

function assertIsolatedUrl(raw: string | undefined): string {
  if (!raw) throw new Error('DATABASE_URL ausente');
  const url = new URL(raw.replace(/^postgres(ql)?:/i, 'http:'));
  const host = url.hostname.toLowerCase();
  const port = url.port || '5432';
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || port !== '5432' || name !== TEST_DATABASE) {
    throw new Error(`banco recusado: ${name || host}`);
  }
  return raw;
}

describe('observação não grava no PostgreSQL isolado', () => {
  let prisma: PrismaClient;
  const email = `observe-${randomUUID()}@refund-tx.test`;

  beforeAll(async () => {
    assertIsolatedUrl(process.env.DATABASE_URL);
    prisma = new PrismaClient();
    await prisma.$connect();
    const meta = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT current_database() AS name
    `;
    if (meta[0]?.name !== TEST_DATABASE) {
      throw new Error(`conexao no banco ${meta[0]?.name ?? 'desconhecido'}`);
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('recusa o banco isolado e a leitura não altera compra, carteira, auditoria nem lease', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Observe Tx',
        email,
        passwordHash: 'hash-ficticio',
        role: 'VENUE',
        state: 'SP',
        city: 'Sao Paulo',
        venue: {
          create: {
            name: 'Bar Ficticio',
            city: 'Sao Paulo',
            state: 'SP',
            wallet: { create: { balance: 3 } },
          },
        },
      },
      include: { venue: true },
    });
    const venue = user.venue;
    if (!venue) throw new Error('venue ausente');
    const created = await prisma.creditPurchase.create({
      data: {
        venueId: venue.id,
        packageKey: 'unit_1',
        amountPaid: 34.9,
        currency: 'BRL',
        credits: 1,
        status: 'PAID',
        provider: 'card',
        providerTxId: 'card:ORD-OBSERVE-FICTICIO',
        confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
      },
    });
    const before = await prisma.creditPurchase.findUniqueOrThrow({ where: { id: created.id } });
    const walletBefore = await prisma.creditWallet.findUniqueOrThrow({ where: { venueId: venue.id } });
    const auditsBefore = await prisma.creditRefundAudit.count({ where: { purchaseId: created.id } });
    const lockBefore = await prisma.$queryRaw<
      Array<{ cursorPurchaseId: string | null; lockedBy: string; cooldownUntil: Date | null }>
    >`
      SELECT "cursorPurchaseId", "lockedBy", "cooldownUntil"
      FROM "CardReconcileLock"
      WHERE id = 1
    `;

    const http = {
      getCurrentUser: async () => {
        throw new Error('consulta externa proibida');
      },
      getOrder: async () => {
        throw new Error('consulta externa proibida');
      },
    };
    await expect(
      observeCardReconciliation({
        purchaseId: created.id,
        env: {
          databaseUrl: process.env.DATABASE_URL,
          sandbox: true,
          production: false,
          reconcileEnabled: false,
          accessToken: 'APP_USR-isolated-observe',
        },
        db: prismaCardObserveDb(prisma),
        http,
      }),
    ).rejects.toBeInstanceOf(CardObserveStopped);

    const read = await prismaCardObserveDb(prisma).purchase(created.id);
    expect(read?.status).toBe('PAID');
    expect(read?.balance).toBe(3);
    expect(read?.auditCount).toBe(0);

    const after = await prisma.creditPurchase.findUniqueOrThrow({ where: { id: created.id } });
    const walletAfter = await prisma.creditWallet.findUniqueOrThrow({ where: { venueId: venue.id } });
    const auditsAfter = await prisma.creditRefundAudit.count({ where: { purchaseId: created.id } });
    const lockAfter = await prisma.$queryRaw<
      Array<{ cursorPurchaseId: string | null; lockedBy: string; cooldownUntil: Date | null }>
    >`
      SELECT "cursorPurchaseId", "lockedBy", "cooldownUntil"
      FROM "CardReconcileLock"
      WHERE id = 1
    `;
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    expect(after.status).toBe(before.status);
    expect(walletAfter.balance).toBe(walletBefore.balance);
    expect(walletAfter.updatedAt.toISOString()).toBe(walletBefore.updatedAt.toISOString());
    expect(auditsAfter).toBe(auditsBefore);
    expect(lockAfter).toEqual(lockBefore);
  });
});
