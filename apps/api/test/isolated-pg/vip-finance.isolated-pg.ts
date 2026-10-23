import { Prisma, PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { BannersService } from '../../src/banners/banners.service';
import { CreditsService } from '../../src/credits/credits.service';
import {
  ISOLATED_PG_DATABASE,
  ISOLATED_PG_HOST,
  ISOLATED_PG_PASSWORD,
  ISOLATED_PG_PORT,
  ISOLATED_PG_USER,
  isolatedSuiteRunAuthorized,
} from '../../src/credits/isolated-pg-guard';
import { PixVerifiedOrder } from '../../src/credits/providers/pix.provider';
import { PaymentProviderRegistry } from '../../src/credits/providers/payment-providers';
import { PrismaService } from '../../src/prisma/prisma.service';
import { vipGrantOperationKey } from '../../src/credits/vip-web-checkout';
import { VipCreditsService } from '../../src/credits/vip-credits.service';

/**
 * Real PostgreSQL proof for VIP purchases. The URL is built only from the
 * disposable constants. DATABASE_URL is never read.
 */
const suite = isolatedSuiteRunAuthorized(process.env) ? describe : describe.skip;

const COMMON_BALANCE = 4;

type SqlClient = PrismaClient;

class FakePix {
  isConfigured = true;
  readonly orders = new Map<string, PixVerifiedOrder>();

  assertWebhookSignature(): void {}

  extractOrderId(payload: unknown): string | null {
    const orderId = (payload as { orderId?: unknown }).orderId;
    return typeof orderId === 'string' ? orderId : null;
  }

  getOrder(orderId: string): Promise<PixVerifiedOrder> {
    const order = this.orders.get(orderId);
    if (!order) return Promise.reject(new Error('pedido ausente'));
    return Promise.resolve({ ...order });
  }
}

type Fixture = {
  userId: string;
  venueId: string;
  prefix: string;
};

let sequence = 0;
let prisma: SqlClient;
let pix: FakePix;
let credits: CreditsService;
let banners: BannersService;

function isolatedUrl(): string {
  const url = new URL(
    `postgresql://${ISOLATED_PG_USER}:${ISOLATED_PG_PASSWORD}@${ISOLATED_PG_HOST}:${ISOLATED_PG_PORT}/${ISOLATED_PG_DATABASE}`,
  );
  if (
    url.hostname !== ISOLATED_PG_HOST ||
    url.port !== ISOLATED_PG_PORT ||
    url.pathname !== `/${ISOLATED_PG_DATABASE}`
  ) {
    throw new Error('destino PostgreSQL recusado');
  }
  return url.toString();
}

function openClient(): SqlClient {
  return new PrismaClient({ datasources: { db: { url: isolatedUrl() } } });
}

function servicesFor(client: SqlClient, provider: FakePix) {
  const db = client as unknown as PrismaService;
  const vip = new VipCreditsService(db);
  const payments = {
    pixProvider: () => provider,
    cardProvider: () => {
      throw new Error('cartão não usado neste teste');
    },
  } as unknown as PaymentProviderRegistry;
  return {
    credits: new CreditsService(db, payments, undefined, vip),
    banners: new BannersService(
      db,
      { get: () => '1' } as unknown as ConfigService,
      {} as never,
    ),
  };
}

function paidOrder(purchaseId: string, orderId: string): PixVerifiedOrder {
  return {
    orderId,
    paymentId: null,
    status: 'PAID',
    amountBrl: 99.9,
    currency: 'BRL',
    externalReference: purchaseId,
    expiresAt: null,
    refundProof: 'none',
  };
}

function refundOrder(purchaseId: string, orderId: string): PixVerifiedOrder {
  return { ...paidOrder(purchaseId, orderId), status: 'REFUNDED', refundProof: 'full' };
}

async function assertDisposable(client: SqlClient): Promise<void> {
  const rows = await client.$queryRaw<
    { database_name: string; user_name: string }[]
  >`SELECT current_database() AS database_name, current_user AS user_name`;
  const row = rows[0];
  if (
    row?.database_name !== ISOLATED_PG_DATABASE ||
    row.user_name !== ISOLATED_PG_USER
  ) {
    await client.$disconnect();
    throw new Error('conexão PostgreSQL isolada recusada');
  }
  console.log(
    `isolated-pg database=${row.database_name} user=${row.user_name} host=${ISOLATED_PG_HOST} port=${ISOLATED_PG_PORT}`,
  );
}

async function seed(): Promise<Fixture> {
  sequence += 1;
  const prefix = `v${sequence}${Date.now().toString(36)}`;
  const user = await prisma.user.create({
    data: {
      name: 'Estabelecimento fictício',
      email: `${prefix}@example.test`,
      passwordHash: 'fixture-not-a-credential',
      role: 'USER',
      state: 'SP',
      city: 'Campinas',
    },
  });
  const venue = await prisma.venue.create({
    data: {
      ownerUserId: user.id,
      name: 'Casa fictícia',
      city: 'Campinas',
      state: 'SP',
    },
  });
  await prisma.creditWallet.create({
    data: { venueId: venue.id, balance: COMMON_BALANCE, vipBalance: 0 },
  });
  return { userId: user.id, venueId: venue.id, prefix };
}

async function wipe(fx: Fixture): Promise<void> {
  await prisma.creditObligation.deleteMany({ where: { venueId: fx.venueId } });
  await prisma.user.delete({ where: { id: fx.userId } }).catch(() => undefined);
}

async function pending(fx: Fixture, suffix: string) {
  const orderId = `${fx.prefix}-${suffix}`;
  return prisma.creditPurchase.create({
    data: {
      venueId: fx.venueId,
      packageKey: 'vip_unit_1',
      productId: 'after.credits.vip.1',
      amountPaid: new Prisma.Decimal('99.90'),
      currency: 'BRL',
      credits: 1,
      status: 'PENDING',
      provider: 'pix',
      providerTxId: `pix:${orderId}`,
    },
  });
}

async function confirm(purchaseId: string, orderId: string) {
  pix.orders.set(orderId, paidOrder(purchaseId, orderId));
  await credits.handlePixWebhook({ orderId });
}

async function refund(purchaseId: string, orderId: string) {
  pix.orders.set(orderId, refundOrder(purchaseId, orderId));
  await credits.handlePixWebhook({ orderId });
}

async function consume(userId: string) {
  await banners.create(
    userId,
    'https://example.test/vip.png',
    [],
    'Divulgação fictícia',
    undefined,
    undefined,
    ['2026-12-15'],
  );
}

async function state(venueId: string) {
  const wallet = await prisma.creditWallet.findUnique({ where: { venueId } });
  const entries = await prisma.vipCreditEntry.findMany({
    where: { venueId },
    orderBy: [{ createdAt: 'asc' }, { operationKey: 'asc' }],
  });
  const obligations = await prisma.creditObligation.findMany({
    where: { venueId },
  });
  return { wallet, entries, obligations };
}

function orderIdOf(purchase: { providerTxId: string | null }): string {
  return purchase.providerTxId?.slice('pix:'.length) ?? '';
}

async function ageGrants(firstId: string, secondId: string) {
  await prisma.vipCreditEntry.update({
    where: { operationKey: vipGrantOperationKey(firstId) },
    data: { createdAt: new Date('2026-10-21T10:00:00.000Z') },
  });
  await prisma.vipCreditEntry.update({
    where: { operationKey: vipGrantOperationKey(secondId) },
    data: { createdAt: new Date('2026-10-21T10:00:01.000Z') },
  });
}

suite('VIP finance isolated postgres', () => {
  beforeAll(async () => {
    prisma = openClient();
    await prisma.$connect();
    await assertDisposable(prisma);
    pix = new FakePix();
    const services = servicesFor(prisma, pix);
    credits = services.credits;
    banners = services.banners;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('compra VIP confirmada', async () => {
    const fx = await seed();
    try {
      const purchase = await pending(fx, 'confirm');
      await confirm(purchase.id, orderIdOf(purchase));
      const saved = await prisma.creditPurchase.findUniqueOrThrow({
        where: { id: purchase.id },
      });
      const current = await state(fx.venueId);
      expect(saved.status).toBe('PAID');
      expect(current.wallet?.balance).toBe(COMMON_BALANCE);
      expect(current.wallet?.vipBalance).toBe(1);
      expect(current.entries.map((entry) => entry.kind)).toEqual(['grant']);
      expect(current.entries[0]?.balanceDelta).toBe(1);
      expect(current.obligations).toHaveLength(0);
    } finally {
      await wipe(fx);
    }
  });

  it('compra duplicada', async () => {
    const fx = await seed();
    try {
      const purchase = await pending(fx, 'dup');
      const orderId = orderIdOf(purchase);
      await confirm(purchase.id, orderId);
      await confirm(purchase.id, orderId);
      const current = await state(fx.venueId);
      expect(current.wallet?.balance).toBe(COMMON_BALANCE);
      expect(current.wallet?.vipBalance).toBe(1);
      expect(current.entries).toHaveLength(1);
    } finally {
      await wipe(fx);
    }
  });

  it('webhook e polling concorrentes', async () => {
    const fx = await seed();
    try {
      const purchase = await pending(fx, 'race');
      const orderId = orderIdOf(purchase);
      pix.orders.set(orderId, paidOrder(purchase.id, orderId));
      await Promise.all([
        credits.handlePixWebhook({ orderId }),
        credits.purchaseById(fx.userId, purchase.id),
      ]);
      const current = await state(fx.venueId);
      const saved = await prisma.creditPurchase.findUniqueOrThrow({
        where: { id: purchase.id },
      });
      expect(saved.status).toBe('PAID');
      expect(current.wallet?.balance).toBe(COMMON_BALANCE);
      expect(current.wallet?.vipBalance).toBe(1);
      expect(current.entries).toHaveLength(1);
    } finally {
      await wipe(fx);
    }
  });

  it('consumo de crédito VIP', async () => {
    const fx = await seed();
    try {
      const purchase = await pending(fx, 'use');
      await confirm(purchase.id, orderIdOf(purchase));
      await consume(fx.userId);
      const current = await state(fx.venueId);
      expect(current.wallet?.balance).toBe(COMMON_BALANCE);
      expect(current.wallet?.vipBalance).toBe(0);
      expect(current.entries.map((entry) => entry.kind)).toEqual(['grant', 'consume']);
      expect(current.entries[1]?.balanceDelta).toBe(-1);
      expect(current.entries[1]?.scheduleId).toBeTruthy();
    } finally {
      await wipe(fx);
    }
  });

  it('reembolso antes do consumo', async () => {
    const fx = await seed();
    try {
      const purchase = await pending(fx, 'early');
      const orderId = orderIdOf(purchase);
      await confirm(purchase.id, orderId);
      await refund(purchase.id, orderId);
      const saved = await prisma.creditPurchase.findUniqueOrThrow({
        where: { id: purchase.id },
      });
      const current = await state(fx.venueId);
      expect(saved.status).toBe('REFUNDED');
      expect(current.wallet?.balance).toBe(COMMON_BALANCE);
      expect(current.wallet?.vipBalance).toBe(0);
      expect(current.entries.map((entry) => entry.balanceDelta)).toEqual([1, -1]);
      expect(current.obligations).toHaveLength(0);
    } finally {
      await wipe(fx);
    }
  });

  it('reembolso após consumo', async () => {
    const fx = await seed();
    try {
      const purchase = await pending(fx, 'late');
      const orderId = orderIdOf(purchase);
      await confirm(purchase.id, orderId);
      await consume(fx.userId);
      await refund(purchase.id, orderId);
      const current = await state(fx.venueId);
      const refundEntry = current.entries.find((entry) => entry.kind === 'refund');
      expect(current.wallet?.balance).toBe(COMMON_BALANCE);
      expect(current.wallet?.vipBalance).toBe(0);
      expect(refundEntry?.balanceDelta).toBe(0);
      expect(current.obligations).toHaveLength(1);
    } finally {
      await wipe(fx);
    }
  });

  it('duas compras VIP distintas', async () => {
    const fx = await seed();
    try {
      const first = await pending(fx, 'a');
      const second = await pending(fx, 'b');
      await confirm(first.id, orderIdOf(first));
      await confirm(second.id, orderIdOf(second));
      const current = await state(fx.venueId);
      expect(current.wallet?.balance).toBe(COMMON_BALANCE);
      expect(current.wallet?.vipBalance).toBe(2);
      expect(current.entries.filter((entry) => entry.kind === 'grant')).toHaveLength(2);
    } finally {
      await wipe(fx);
    }
  });

  it('reembolso da primeira após consumo', async () => {
    const fx = await seed();
    try {
      const first = await pending(fx, 'old');
      const second = await pending(fx, 'new');
      await confirm(first.id, orderIdOf(first));
      await confirm(second.id, orderIdOf(second));
      await ageGrants(first.id, second.id);
      await consume(fx.userId);
      await refund(first.id, orderIdOf(first));
      const saved = await prisma.creditPurchase.findUniqueOrThrow({
        where: { id: first.id },
      });
      const current = await state(fx.venueId);
      const firstRefund = current.entries.find(
        (entry) => entry.operationKey === `vip:purchase:${first.id}:refund`,
      );
      expect(saved.status).toBe('REFUNDED');
      expect(firstRefund?.balanceDelta).toBe(0);
      expect(current.obligations.map((row) => row.purchaseId)).toEqual([first.id]);
      expect(current.wallet?.vipBalance).toBe(1);
    } finally {
      await wipe(fx);
    }
  });

  it('preservação dos créditos da segunda', async () => {
    const fx = await seed();
    try {
      const first = await pending(fx, 'spent');
      const second = await pending(fx, 'kept');
      await confirm(first.id, orderIdOf(first));
      await confirm(second.id, orderIdOf(second));
      await ageGrants(first.id, second.id);
      await consume(fx.userId);
      await refund(first.id, orderIdOf(first));
      const kept = await prisma.creditPurchase.findUniqueOrThrow({
        where: { id: second.id },
      });
      const current = await state(fx.venueId);
      const secondGrant = current.entries.find(
        (entry) => entry.operationKey === vipGrantOperationKey(second.id),
      );
      expect(kept.status).toBe('PAID');
      expect(secondGrant?.balanceDelta).toBe(1);
      expect(current.wallet?.balance).toBe(COMMON_BALANCE);
      expect(current.wallet?.vipBalance).toBe(1);
      expect(
        current.obligations.every((row) => row.purchaseId !== second.id),
      ).toBe(true);
    } finally {
      await wipe(fx);
    }
  });

  it('registro de CreditObligation', async () => {
    const fx = await seed();
    try {
      const purchase = await pending(fx, 'debt');
      const orderId = orderIdOf(purchase);
      await confirm(purchase.id, orderId);
      await consume(fx.userId);
      await refund(purchase.id, orderId);
      const current = await state(fx.venueId);
      expect(current.obligations).toHaveLength(1);
      expect(current.obligations[0]).toMatchObject({
        venueId: fx.venueId,
        purchaseId: purchase.id,
        creditsOriginal: 1,
        creditsRecovered: 0,
        creditsOpened: 1,
        creditsSettled: 0,
        status: 'open',
        source: 'pix_full_refund',
      });
      const audits = await prisma.creditRefundAudit.findMany({
        where: { purchaseId: purchase.id },
      });
      expect(audits.map((audit) => audit.kind)).toEqual(['shortfall']);
    } finally {
      await wipe(fx);
    }
  });

  it('idempotência de estorno', async () => {
    const fx = await seed();
    try {
      const purchase = await pending(fx, 'once');
      const orderId = orderIdOf(purchase);
      await confirm(purchase.id, orderId);
      await refund(purchase.id, orderId);
      await refund(purchase.id, orderId);
      const current = await state(fx.venueId);
      expect(current.wallet?.balance).toBe(COMMON_BALANCE);
      expect(current.wallet?.vipBalance).toBe(0);
      expect(current.entries.filter((entry) => entry.kind === 'refund')).toHaveLength(1);
      expect(current.obligations).toHaveLength(0);
    } finally {
      await wipe(fx);
    }
  });

  it('falha de transação', async () => {
    const fx = await seed();
    const failing = openClient();
    let armed = true;
    (failing as SqlClient & {
      $use(
        hook: (
          params: { model?: string; action: string },
          next: (params: { model?: string; action: string }) => Promise<unknown>,
        ) => Promise<unknown>,
      ): void;
    }).$use(async (params, next) => {
      if (armed && params.model === 'VipCreditEntry' && params.action === 'createMany') {
        armed = false;
        throw new Error('injected');
      }
      return next(params);
    });
    const localPix = new FakePix();
    const local = servicesFor(failing, localPix);
    try {
      const purchase = await pending(fx, 'fail');
      const orderId = orderIdOf(purchase);
      localPix.orders.set(orderId, paidOrder(purchase.id, orderId));
      await expect(local.credits.handlePixWebhook({ orderId })).rejects.toThrow(/injected/);
      const saved = await prisma.creditPurchase.findUniqueOrThrow({
        where: { id: purchase.id },
      });
      const current = await state(fx.venueId);
      expect(saved.status).toBe('PENDING');
      expect(current.wallet?.balance).toBe(COMMON_BALANCE);
      expect(current.wallet?.vipBalance).toBe(0);
      expect(current.entries).toHaveLength(0);
      expect(current.obligations).toHaveLength(0);
    } finally {
      await failing.$disconnect();
      await wipe(fx);
    }
  });

  it('recuperação após falha', async () => {
    const fx = await seed();
    const failing = openClient();
    let armed = true;
    (failing as SqlClient & {
      $use(
        hook: (
          params: { model?: string; action: string },
          next: (params: { model?: string; action: string }) => Promise<unknown>,
        ) => Promise<unknown>,
      ): void;
    }).$use(async (params, next) => {
      if (armed && params.model === 'VipCreditEntry' && params.action === 'createMany') {
        armed = false;
        throw new Error('injected');
      }
      return next(params);
    });
    const localPix = new FakePix();
    const local = servicesFor(failing, localPix);
    try {
      const purchase = await pending(fx, 'retry');
      const orderId = orderIdOf(purchase);
      localPix.orders.set(orderId, paidOrder(purchase.id, orderId));
      await expect(local.credits.handlePixWebhook({ orderId })).rejects.toThrow(/injected/);
      await failing.$disconnect();
      pix.orders.set(orderId, paidOrder(purchase.id, orderId));
      await credits.handlePixWebhook({ orderId });
      const saved = await prisma.creditPurchase.findUniqueOrThrow({
        where: { id: purchase.id },
      });
      const current = await state(fx.venueId);
      expect(saved.status).toBe('PAID');
      expect(current.wallet?.balance).toBe(COMMON_BALANCE);
      expect(current.wallet?.vipBalance).toBe(1);
      expect(current.entries).toHaveLength(1);
      expect(current.entries[0]?.kind).toBe('grant');
    } finally {
      await failing.$disconnect().catch(() => undefined);
      await wipe(fx);
    }
  });
});
