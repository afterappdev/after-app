import { randomUUID } from 'crypto';
import { Prisma, PrismaClient, PurchaseStatus } from '@prisma/client';
import {
  buildRefundPosition,
  fullRefundsInRange,
  openRefundReviewsInRange,
  partialRefundsInRange,
  salesByProviderInRange,
} from '../src/admin/finance';
import { monthRangeUtc } from '../src/admin/timezone';
import { CreditsService } from '../src/credits/credits.service';
import { settleCardTerminalStatus } from '../src/credits/card-refund.ledger';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentProviderRegistry } from '../src/credits/providers/payment-providers';
import {
  CardPaymentProvider,
  CardReconcileRateLimitError,
  CardReconcileTransportError,
  CardVerifiedOrder,
  cardRefundAction,
} from '../src/credits/providers/card.provider';
import {
  SANDBOX_PARTIAL_ORDER_ID,
  SANDBOX_PARTIAL_REFUND_ID,
  sandboxPartialCardOrder,
} from '../src/credits/providers/card-refund.sandbox-fixture';
import { PixVerifiedOrder } from '../src/credits/providers/pix.provider';

const TEST_DATABASE = 'after_refund_tx';
const AMOUNT = 34.9;
const REMOTE_HOSTS = ['railway', 'rlwy', 'amazonaws', 'neon', 'supabase', 'render'];

type AuditRow = {
  kind: string;
  creditsRecovered: number | null;
  creditsUnrecovered: number | null;
};

type Snapshot = {
  status: string;
  balance: number;
  audits: AuditRow[];
};

jest.setTimeout(30_000);

function assertIsolatedUrl(raw: string | undefined): void {
  if (!raw) {
    throw new Error('DATABASE_URL ausente');
  }
  const url = new URL(raw.replace(/^postgres(ql)?:/i, 'http:'));
  const host = url.hostname.toLowerCase();
  const port = url.port || '5432';
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    throw new Error(`host recusado: ${host}`);
  }
  if (port !== '5432') {
    throw new Error(`porta recusada: ${port}`);
  }
  if (REMOTE_HOSTS.some((item) => host.includes(item) || name.includes(item))) {
    throw new Error('destino remoto recusado');
  }
  if (name === 'after' || name !== TEST_DATABASE) {
    throw new Error(`banco recusado: ${name}`);
  }
}

function orderId(): string {
  return `ORD${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function cardOrder(
  purchaseId: string,
  id: string,
  status: CardVerifiedOrder['status'],
  refundScope: 'none' | 'partial' | 'full',
): CardVerifiedOrder {
  return {
    orderId: id,
    paymentId: null,
    status,
    amountBrl: AMOUNT,
    currency: 'BRL',
    externalReference: purchaseId,
    installments: 1,
    paymentType: 'credit_card',
    paymentMethodId: 'visa',
    refundScope,
    refundedAmountBrl: refundScope === 'full' ? AMOUNT : null,
    refundId: refundScope === 'none' ? null : 'refund-ficticio',
  };
}

function gate(parties: number) {
  let arrived = 0;
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived >= parties) open();
    await Promise.race([
      opened,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('barreira de concorrencia expirou')), 8_000);
      }),
    ]);
  };
}

describe('estornos de cartao no PostgreSQL isolado', () => {
  let prisma: PrismaClient;
  let fetchSpy: jest.SpyInstance;
  const createChargeCalls: jest.Mock[] = [];

  beforeAll(async () => {
    assertIsolatedUrl(process.env.DATABASE_URL);
    prisma = new PrismaClient();
    await prisma.$connect();
    const meta = await prisma.$queryRaw<Array<{ db: string; version: string }>>`
      SELECT current_database() AS db, current_setting('server_version') AS version
    `;
    if (meta[0]?.db !== TEST_DATABASE) {
      throw new Error(`conexao no banco ${meta[0]?.db ?? 'desconhecido'}`);
    }
    const tables = await prisma.$queryRaw<
      Array<{ audit: string | null; lock: string | null }>
    >`
      SELECT to_regclass('"CreditRefundAudit"')::text AS audit,
             to_regclass('"CardReconcileLock"')::text AS lock
    `;
    if (!tables[0]?.audit || !tables[0]?.lock) {
      throw new Error('schema de estorno ausente no banco isolado');
    }
    console.log(`REFUND_TX db=${meta[0].db} postgres=${meta[0].version}`);
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@refund-tx.test' } },
    });
    const left = await prisma.creditPurchase.count();
    fetchSpy.mockRestore();
    await prisma.$disconnect();
    if (left !== 0) {
      throw new Error(`compras ficticias restantes: ${left}`);
    }
  });

  beforeEach(async () => {
    await prisma.$executeRaw`
      UPDATE "CardReconcileLock"
      SET "lockedUntil" = TIMESTAMP '1970-01-01 00:00:00',
          "lockedBy" = '',
          "cursorConfirmedAt" = NULL,
          "cursorPurchaseId" = NULL,
          "cooldownUntil" = NULL
      WHERE id = 1
    `;
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@refund-tx.test' } },
    });
    const negative = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "CreditWallet" WHERE balance < 0
    `;
    expect(Number(negative[0]?.n ?? 0)).toBe(0);
    for (const call of createChargeCalls) {
      expect(call).not.toHaveBeenCalled();
    }
    createChargeCalls.length = 0;
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockClear();
  });

  function service(db: PrismaClient = prisma) {
    const pixCharge = jest.fn(async () => {
      throw new Error('cobranca proibida');
    });
    const cardCharge = jest.fn(async () => {
      throw new Error('cobranca proibida');
    });
    createChargeCalls.push(pixCharge, cardCharge);
    const pix = {
      id: 'pix' as const,
      isConfigured: true,
      assertWebhookSignature: () => undefined,
      extractOrderId: (_payload: unknown) => '',
      getOrder: async (_orderId: string): Promise<PixVerifiedOrder> => {
        throw new Error('pix getOrder nao configurado');
      },
      createCharge: pixCharge,
    };
    const card = {
      id: 'card' as const,
      isConfigured: true,
      getOrder: async (_orderId: string): Promise<CardVerifiedOrder> => {
        throw new Error('card getOrder nao configurado');
      },
      createCharge: cardCharge,
    };
    const payments = {
      pixProvider: () => pix,
      cardProvider: () => card,
    } as unknown as PaymentProviderRegistry;
    return {
      credits: new CreditsService(db as unknown as PrismaService, payments),
      pix,
      card,
    };
  }

  async function seed(input: {
    status: 'PENDING' | 'PAID';
    credits: number;
    balance?: number;
    confirmedAt?: Date | null;
  }) {
    const id = orderId();
    const user = await prisma.user.create({
      data: {
        name: 'Estorno Tx',
        email: `estorno-${randomUUID()}@refund-tx.test`,
        passwordHash: 'hash-ficticio',
        role: 'VENUE',
        state: 'SP',
        city: 'Sao Paulo',
        venue: {
          create: {
            name: 'Bar Ficticio',
            city: 'Sao Paulo',
            state: 'SP',
            ...(input.balance === undefined
              ? {}
              : { wallet: { create: { balance: input.balance } } }),
          },
        },
      },
      include: { venue: true },
    });
    const venue = user.venue;
    if (!venue) throw new Error('venue ausente');
    const purchase = await prisma.creditPurchase.create({
      data: {
        venueId: venue.id,
        packageKey: 'unit_1',
        amountPaid: AMOUNT,
        currency: 'BRL',
        credits: input.credits,
        status: input.status,
        provider: 'card',
        providerTxId: `card:${id}`,
        confirmedAt:
          input.confirmedAt === undefined
            ? input.status === 'PAID'
              ? new Date()
              : null
            : input.confirmedAt,
      },
    });
    return { userId: user.id, venueId: venue.id, purchaseId: purchase.id, orderId: id };
  }

  async function snapshot(purchaseId: string, venueId: string): Promise<Snapshot> {
    const purchase = await prisma.creditPurchase.findUniqueOrThrow({
      where: { id: purchaseId },
    });
    const wallet = await prisma.creditWallet.findUnique({ where: { venueId } });
    const audits = await prisma.$queryRaw<AuditRow[]>`
      SELECT kind,
             "creditsRecovered",
             "creditsUnrecovered"
      FROM "CreditRefundAudit"
      WHERE "purchaseId" = ${purchaseId}
      ORDER BY kind
    `;
    return {
      status: purchase.status,
      balance: wallet?.balance ?? 0,
      audits: audits.map((row) => ({
        kind: row.kind,
        creditsRecovered:
          row.creditsRecovered === null ? null : Number(row.creditsRecovered),
        creditsUnrecovered:
          row.creditsUnrecovered === null ? null : Number(row.creditsUnrecovered),
      })),
    };
  }

  function log(scenario: string, before: Snapshot, after: Snapshot) {
    console.log(`REFUND_TX ${JSON.stringify({ scenario, before, after })}`);
  }

  function armWebhook(
    harness: ReturnType<typeof service>,
    purchaseId: string,
    id: string,
    respond: () => Promise<CardVerifiedOrder>,
  ) {
    harness.pix.extractOrderId = () => id;
    harness.pix.getOrder = async (requested) => ({
      orderId: requested,
      paymentId: null,
      status: 'PAID',
      amountBrl: AMOUNT,
      currency: 'BRL',
      externalReference: purchaseId,
      expiresAt: null,
    });
    harness.card.getOrder = respond;
  }

  async function webhook(harness: ReturnType<typeof service>) {
    await harness.credits.handlePixWebhook({ data: { id: 'simulado' } }, {});
  }

  it('confirma e estorna ao mesmo tempo sem credito duplicado nem saldo negativo', async () => {
    const harness = service();
    const fixture = await seed({ status: 'PENDING', credits: 1 });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    const arrive = gate(2);
    let turn = 0;
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () => {
      const mine = turn;
      turn += 1;
      await arrive();
      return mine === 0
        ? cardOrder(fixture.purchaseId, fixture.orderId, 'PAID', 'none')
        : cardOrder(fixture.purchaseId, fixture.orderId, 'REFUNDED', 'full');
    });

    await Promise.all([
      harness.credits.purchaseById(fixture.userId, fixture.purchaseId),
      webhook(harness),
    ]);

    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    log('confirmacao-e-estorno', before, after);
    expect(before).toMatchObject({ status: 'PENDING', balance: 0, audits: [] });
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(0);
    expect(after.audits).toEqual([]);
    expect(await prisma.creditPurchase.count({ where: { venueId: fixture.venueId } })).toBe(1);
  });

  it('dois webhooks de estorno simultaneos debitam uma unica vez', async () => {
    const harness = service();
    const fixture = await seed({ status: 'PAID', credits: 5, balance: 8 });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    const arrive = gate(2);
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () => {
      await arrive();
      return cardOrder(fixture.purchaseId, fixture.orderId, 'REFUNDED', 'full');
    });

    await Promise.all([webhook(harness), webhook(harness)]);

    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    log('dois-webhooks', before, after);
    expect(before).toMatchObject({ status: 'PAID', balance: 8, audits: [] });
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(3);
    expect(after.audits).toEqual([]);
  });

  it('webhook e reconciliacao simultaneos nao debitam duas vezes', async () => {
    const harness = service();
    const confirmedAt = new Date(Date.now() - 20 * 60 * 1000);
    const fixture = await seed({
      status: 'PAID',
      credits: 5,
      balance: 8,
      confirmedAt,
    });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    const arrive = gate(2);
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () => {
      await arrive();
      return cardOrder(fixture.purchaseId, fixture.orderId, 'REFUNDED', 'full');
    });

    await Promise.all([
      webhook(harness),
      harness.credits.reconcilePaidCardPurchases(new Date()),
    ]);

    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    log('webhook-e-polling', before, after);
    expect(before).toMatchObject({ status: 'PAID', balance: 8, audits: [] });
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(3);
    expect(after.audits).toEqual([]);
  });

  it('estorna com saldo suficiente e nao grava auditoria de insuficiencia', async () => {
    const harness = service();
    const fixture = await seed({ status: 'PAID', credits: 5, balance: 8 });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () =>
      cardOrder(fixture.purchaseId, fixture.orderId, 'REFUNDED', 'full'),
    );

    await webhook(harness);

    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    log('saldo-suficiente', before, after);
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(3);
    expect(after.audits).toEqual([]);
  });

  it('estorna com saldo zero e registra uma unica insuficiencia', async () => {
    const harness = service();
    const fixture = await seed({ status: 'PAID', credits: 5, balance: 0 });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () =>
      cardOrder(fixture.purchaseId, fixture.orderId, 'REFUNDED', 'full'),
    );

    await webhook(harness);
    const once = await snapshot(fixture.purchaseId, fixture.venueId);
    await webhook(harness);
    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    log('saldo-zero', before, after);
    expect(once).toEqual(after);
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(0);
    expect(after.audits).toEqual([
      { kind: 'shortfall', creditsRecovered: 0, creditsUnrecovered: 5 },
    ]);
  });

  it('estorna com saldo parcial e mantem um unico registro de auditoria', async () => {
    const harness = service();
    const fixture = await seed({ status: 'PAID', credits: 5, balance: 2 });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () =>
      cardOrder(fixture.purchaseId, fixture.orderId, 'REFUNDED', 'full'),
    );

    await webhook(harness);
    await webhook(harness);
    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    log('saldo-parcial', before, after);
    expect(before.balance).toBe(2);
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(0);
    expect(after.audits).toEqual([
      { kind: 'shortfall', creditsRecovered: 2, creditsUnrecovered: 3 },
    ]);
  });

  it('libera o bloqueio da compra depois de um rollback e conclui o estorno', async () => {
    const harness = service();
    const fixture = await seed({ status: 'PAID', credits: 5, balance: 8 });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "CreditPurchase" WHERE id = ${fixture.purchaseId} FOR UPDATE
        `;
        await tx.$executeRaw`
          UPDATE "CreditWallet"
          SET balance = balance - 100
          WHERE "venueId" = ${fixture.venueId}
        `;
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    const rolledBack = await snapshot(fixture.purchaseId, fixture.venueId);
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () =>
      cardOrder(fixture.purchaseId, fixture.orderId, 'REFUNDED', 'full'),
    );
    await webhook(harness);
    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    log('rollback', before, after);
    expect(rolledBack).toEqual(before);
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(3);
  });

  it('detecta estorno de compra paga sem criar cobranca', async () => {
    const harness = service();
    const confirmedAt = new Date(Date.now() - 20 * 60 * 1000);
    const fixture = await seed({
      status: 'PAID',
      credits: 5,
      balance: 8,
      confirmedAt,
    });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    harness.card.getOrder = async () =>
      cardOrder(fixture.purchaseId, fixture.orderId, 'REFUNDED', 'full');

    const result = await harness.credits.reconcilePaidCardPurchases(new Date());
    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    log('reconciliar-paga', before, after);
    expect(result).toMatchObject({ skipped: false, checked: 1, refunded: 1, errors: 0 });
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(3);
    expect(after.audits).toEqual([]);
  });

  it('registra verificação sem débito e resolve depois sem apagar o histórico', async () => {
    const database = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT current_database() AS name
    `;
    expect(database[0]?.name).toBe('after_refund_tx');
    const confirmedAt = new Date(Date.now() - 20 * 60 * 1000);
    const partialCase = await seed({
      status: 'PAID',
      credits: 5,
      balance: 8,
      confirmedAt,
    });

    const reviewOrder = (
      purchaseId: string,
      orderId: string,
    ): CardVerifiedOrder => ({
      ...cardOrder(purchaseId, orderId, 'REFUNDED', 'none'),
      refundScope: 'review',
      refundedAmountBrl: null,
      refundId: null,
    });

    const partialHarness = service();
    armWebhook(
      partialHarness,
      partialCase.purchaseId,
      partialCase.orderId,
      async () => reviewOrder(partialCase.purchaseId, partialCase.orderId),
    );
    await webhook(partialHarness);
    await webhook(partialHarness);
    const partialReview = await partialHarness.credits.reconcilePaidCardPurchases(
      new Date(),
    );
    const openPartial = await snapshot(partialCase.purchaseId, partialCase.venueId);
    expect(partialReview).toMatchObject({
      skipped: false,
      refunded: 0,
      partial: 0,
      errors: 0,
    });
    expect(openPartial.status).toBe('PAID');
    expect(openPartial.balance).toBe(8);
    expect(openPartial.audits).toEqual([
      { kind: 'refund_review', creditsRecovered: null, creditsUnrecovered: null },
    ]);

    armWebhook(
      partialHarness,
      partialCase.purchaseId,
      partialCase.orderId,
      async () => ({
        ...cardOrder(partialCase.purchaseId, partialCase.orderId, 'PAID', 'partial'),
        refundedAmountBrl: 10,
        refundId: 'refund-parcial-ficticio',
      }),
    );
    await webhook(partialHarness);
    const provenPartial = await snapshot(partialCase.purchaseId, partialCase.venueId);
    expect(provenPartial.status).toBe('PAID');
    expect(provenPartial.balance).toBe(8);
    expect(provenPartial.audits).toEqual([
      { kind: 'partial_review', creditsRecovered: null, creditsUnrecovered: null },
      { kind: 'refund_review', creditsRecovered: null, creditsUnrecovered: null },
    ]);

    const fullCase = await seed({
      status: 'PAID',
      credits: 5,
      balance: 8,
      confirmedAt: new Date(confirmedAt.getTime() - 1000),
    });
    const fullHarness = service();
    armWebhook(
      fullHarness,
      fullCase.purchaseId,
      fullCase.orderId,
      async () => reviewOrder(fullCase.purchaseId, fullCase.orderId),
    );
    await webhook(fullHarness);
    const openFull = await snapshot(fullCase.purchaseId, fullCase.venueId);
    expect(openFull.audits).toEqual([
      { kind: 'refund_review', creditsRecovered: null, creditsUnrecovered: null },
    ]);
    armWebhook(
      fullHarness,
      fullCase.purchaseId,
      fullCase.orderId,
      async () => cardOrder(fullCase.purchaseId, fullCase.orderId, 'REFUNDED', 'full'),
    );
    await webhook(fullHarness);
    await webhook(fullHarness);
    const provenFull = await snapshot(fullCase.purchaseId, fullCase.venueId);
    expect(provenFull.status).toBe('REFUNDED');
    expect(provenFull.balance).toBe(3);
    expect(provenFull.audits).toEqual([
      { kind: 'refund_review', creditsRecovered: null, creditsUnrecovered: null },
    ]);

    const proof = await prisma.$queryRaw<
      Array<{ kind: string; refundedAmount: unknown; refundId: string | null }>
    >`
      SELECT kind, "refundedAmount", "refundId"
      FROM "CreditRefundAudit"
      WHERE kind = 'refund_review'
        AND (
          "purchaseId" = ${partialCase.purchaseId}
          OR "purchaseId" = ${fullCase.purchaseId}
        )
    `;
    expect(proof).toHaveLength(2);
    expect(proof.every((row) => row.refundedAmount == null && row.refundId == null)).toBe(
      true,
    );
  });

  function partialOrder(
    purchaseId: string,
    id: string,
    amount: number,
    refundId: string | null,
  ): CardVerifiedOrder {
    return {
      ...cardOrder(purchaseId, id, 'PAID', 'partial'),
      refundedAmountBrl: amount,
      refundId,
    };
  }

  async function partialAmount(purchaseId: string): Promise<number | null> {
    const rows = await prisma.$queryRaw<
      Array<{ refundedAmount: unknown; rows: number }>
    >`
      SELECT "refundedAmount", COUNT(*) OVER ()::int AS rows
      FROM "CreditRefundAudit"
      WHERE "purchaseId" = ${purchaseId} AND kind = 'partial_review'
    `;
    expect(rows).toHaveLength(1);
    const amount = rows[0]?.refundedAmount;
    return amount == null ? null : Number(amount);
  }

  async function paidPartialSum(purchaseId: string): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ known: unknown }>>`
      SELECT COALESCE(SUM(a."refundedAmount"), 0) AS known
      FROM "CreditRefundAudit" a
      INNER JOIN "CreditPurchase" p ON p.id = a."purchaseId"
      WHERE a.kind = 'partial_review'
        AND p.status = 'PAID'
        AND p.id = ${purchaseId}
    `;
    return Number(rows[0]?.known ?? 0);
  }

  it('dois webhooks simultaneos do mesmo parcial gravam uma linha', async () => {
    const harness = service();
    const fixture = await seed({ status: 'PAID', credits: 1, balance: 3 });
    const arrive = gate(2);
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () => {
      await arrive();
      return partialOrder(fixture.purchaseId, fixture.orderId, 10, 'REF-A');
    });

    await Promise.all([webhook(harness), webhook(harness)]);

    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    expect(after.status).toBe('PAID');
    expect(after.balance).toBe(3);
    expect(after.audits).toEqual([
      { kind: 'partial_review', creditsRecovered: null, creditsUnrecovered: null },
    ]);
    expect(await partialAmount(fixture.purchaseId)).toBe(10);
    expect(await paidPartialSum(fixture.purchaseId)).toBe(10);
  });

  it('fixture sandbox com reference_id diferente grava um parcial e nao debita', async () => {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-test-token-secret';
    const parser = new CardPaymentProvider({
      getOrder: async () => ({ status: 200, data: sandboxPartialCardOrder() }),
    } as never);
    const verified = await parser.getOrder(SANDBOX_PARTIAL_ORDER_ID);
    expect(verified.refundScope).toBe('partial');
    expect(verified.refundedAmountBrl).toBe(10);
    expect(cardRefundAction(verified)).toBe('partial');

    const harness = service();
    const fixture = await seed({ status: 'PAID', credits: 1, balance: 21 });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    const arrive = gate(2);
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () => {
      await arrive();
      return {
        ...verified,
        orderId: fixture.orderId,
        externalReference: fixture.purchaseId,
      };
    });

    await Promise.all([webhook(harness), webhook(harness)]);

    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    log('sandbox-parcial-reference', before, after);
    expect(after.status).toBe('PAID');
    expect(after.balance).toBe(21);
    expect(after.audits).toEqual([
      { kind: 'partial_review', creditsRecovered: null, creditsUnrecovered: null },
    ]);
    expect(await partialAmount(fixture.purchaseId)).toBe(10);
    const stored = await prisma.$queryRaw<Array<{ refundId: string | null }>>`
      SELECT "refundId"
      FROM "CreditRefundAudit"
      WHERE "purchaseId" = ${fixture.purchaseId} AND kind = 'partial_review'
    `;
    expect(stored).toEqual([{ refundId: SANDBOX_PARTIAL_REFUND_ID }]);
  });

  it('webhooks simultaneos preservam o maior parcial comprovado', async () => {
    const harness = service();
    const fixture = await seed({ status: 'PAID', credits: 1, balance: 3 });
    const arrive = gate(2);
    let turn = 0;
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () => {
      const mine = turn;
      turn += 1;
      await arrive();
      return partialOrder(
        fixture.purchaseId,
        fixture.orderId,
        mine === 0 ? 10 : 20,
        mine === 0 ? 'REF-A' : null,
      );
    });

    await Promise.all([webhook(harness), webhook(harness)]);

    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    expect(after.status).toBe('PAID');
    expect(after.balance).toBe(3);
    expect(await partialAmount(fixture.purchaseId)).toBe(20);
    expect(await paidPartialSum(fixture.purchaseId)).toBe(20);
  });

  it('webhook e reconciliacao simultaneos gravam um unico parcial', async () => {
    const harness = service();
    const fixture = await seed({
      status: 'PAID',
      credits: 1,
      balance: 3,
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    const arrive = gate(2);
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () => {
      await arrive();
      return partialOrder(fixture.purchaseId, fixture.orderId, 10, 'REF-A');
    });

    const [reconciled] = await Promise.all([
      harness.credits.reconcilePaidCardPurchases(new Date()),
      webhook(harness),
    ]);

    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    expect(reconciled.partial).toBe(1);
    expect(reconciled.refunded).toBe(0);
    expect(after.status).toBe('PAID');
    expect(after.balance).toBe(3);
    expect(after.audits).toHaveLength(1);
    expect(await partialAmount(fixture.purchaseId)).toBe(10);
  });

  it('repete o mesmo parcial, acumula o segundo e nao reduz', async () => {
    const harness = service();
    const fixture = await seed({ status: 'PAID', credits: 1, balance: 3 });
    const send = async (amount: number, refundId: string | null) => {
      armWebhook(harness, fixture.purchaseId, fixture.orderId, async () =>
        partialOrder(fixture.purchaseId, fixture.orderId, amount, refundId),
      );
      await webhook(harness);
    };

    await send(10, 'REF-A');
    await send(10, 'REF-A');
    expect(await partialAmount(fixture.purchaseId)).toBe(10);
    await send(20, null);
    await send(10, 'REF-MENOR');

    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    expect(after.status).toBe('PAID');
    expect(after.balance).toBe(3);
    expect(after.audits).toHaveLength(1);
    expect(await partialAmount(fixture.purchaseId)).toBe(20);
    expect(await paidPartialSum(fixture.purchaseId)).toBe(20);
  });

  it('parcial seguido de estorno total debita uma vez e sai da soma parcial', async () => {
    const harness = service();
    const fixture = await seed({ status: 'PAID', credits: 5, balance: 8 });
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () =>
      partialOrder(fixture.purchaseId, fixture.orderId, 10, 'REF-A'),
    );
    await webhook(harness);
    expect(await paidPartialSum(fixture.purchaseId)).toBe(10);

    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () =>
      cardOrder(fixture.purchaseId, fixture.orderId, 'REFUNDED', 'full'),
    );
    await webhook(harness);
    await webhook(harness);

    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(3);
    expect(await partialAmount(fixture.purchaseId)).toBe(10);
    expect(await paidPartialSum(fixture.purchaseId)).toBe(0);
  });

  it('rollback durante a atualizacao da auditoria preserva o parcial anterior', async () => {
    const harness = service();
    const fixture = await seed({ status: 'PAID', credits: 1, balance: 3 });
    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () =>
      partialOrder(fixture.purchaseId, fixture.orderId, 10, 'REF-A'),
    );
    await webhook(harness);

    await expect(
      prisma.$transaction(async (tx) => {
        await settleCardTerminalStatus(tx, {
          purchaseId: fixture.purchaseId,
          status: 'REFUNDED',
          refundScope: 'partial',
          refundedAmountBrl: 20,
          refundId: null,
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await partialAmount(fixture.purchaseId)).toBe(10);
    const during = await snapshot(fixture.purchaseId, fixture.venueId);
    expect(during.status).toBe('PAID');
    expect(during.balance).toBe(3);

    armWebhook(harness, fixture.purchaseId, fixture.orderId, async () =>
      partialOrder(fixture.purchaseId, fixture.orderId, 20, null),
    );
    await webhook(harness);
    expect(await partialAmount(fixture.purchaseId)).toBe(20);
    expect(await paidPartialSum(fixture.purchaseId)).toBe(20);
  });

  it('execucoes concorrentes respeitam CardReconcileLock', async () => {
    const harness = service();
    const confirmedAt = new Date(Date.now() - 20 * 60 * 1000);
    const fixture = await seed({
      status: 'PAID',
      credits: 5,
      balance: 8,
      confirmedAt,
    });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let reads = 0;
    harness.card.getOrder = async () => {
      reads += 1;
      entered();
      await hold;
      return cardOrder(fixture.purchaseId, fixture.orderId, 'REFUNDED', 'full');
    };

    const first = harness.credits.reconcilePaidCardPurchases(new Date());
    await waiting;
    const second = await harness.credits.reconcilePaidCardPurchases(new Date());
    const during = await prisma.$queryRaw<
      Array<{ lockedBy: string; held: boolean; cursorPurchaseId: string | null }>
    >`
      SELECT "lockedBy", ("lockedUntil" > NOW()) AS held, "cursorPurchaseId"
      FROM "CardReconcileLock"
      WHERE id = 1
    `;
    const stolen = await prisma.$executeRaw`
      UPDATE "CardReconcileLock"
      SET "cursorPurchaseId" = 'intruso', "cursorConfirmedAt" = NOW()
      WHERE id = 1 AND "lockedBy" = 'other-token' AND "lockedUntil" > NOW()
    `;
    const mid = await snapshot(fixture.purchaseId, fixture.venueId);
    release();
    const done = await first;
    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    const lock = await prisma.$queryRaw<Array<{ lockedBy: string }>>`
      SELECT "lockedBy" FROM "CardReconcileLock" WHERE id = 1
    `;
    log('lock-concorrente', before, after);
    expect(second.skipped).toBe(true);
    expect(reads).toBe(1);
    expect(Number(stolen)).toBe(0);
    expect(during[0]?.lockedBy).not.toBe('');
    expect(during[0]?.held).toBe(true);
    expect(during[0]?.cursorPurchaseId).toBeNull();
    expect(mid.status).toBe('PAID');
    expect(mid.balance).toBe(8);
    expect(done.refunded).toBe(1);
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(3);
    expect(lock[0]?.lockedBy).toBe('');
  });

  it('falha de comunicacao preserva a compra e a tentativa seguinte estorna', async () => {
    const harness = service();
    const confirmedAt = new Date(Date.now() - 20 * 60 * 1000);
    const fixture = await seed({
      status: 'PAID',
      credits: 5,
      balance: 8,
      confirmedAt,
    });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    harness.card.getOrder = async () => {
      throw new Error('falha de comunicacao');
    };

    const failed = await harness.credits.reconcilePaidCardPurchases(new Date());
    const unchanged = await snapshot(fixture.purchaseId, fixture.venueId);
    const lock = await prisma.$queryRaw<Array<{ lockedBy: string }>>`
      SELECT "lockedBy" FROM "CardReconcileLock" WHERE id = 1
    `;
    log('falha-comunicacao', before, unchanged);
    expect(failed.errors).toBe(1);
    expect(unchanged).toEqual(before);
    expect(lock[0]?.lockedBy).toBe('');

    harness.card.getOrder = async () =>
      cardOrder(fixture.purchaseId, fixture.orderId, 'REFUNDED', 'full');
    const retried = await harness.credits.reconcilePaidCardPurchases(new Date());
    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    log('nova-tentativa', unchanged, after);
    expect(retried).toMatchObject({ skipped: false, checked: 1, refunded: 1, errors: 0 });
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(3);
  });

  async function seedMany(count: number, balance = 0, db: PrismaClient = prisma) {
    const user = await db.user.create({
      data: {
        name: 'Estorno Tx',
        email: `estorno-${randomUUID()}@refund-tx.test`,
        passwordHash: 'hash-ficticio',
        role: 'VENUE',
        state: 'SP',
        city: 'Sao Paulo',
        venue: {
          create: {
            name: 'Bar Ficticio',
            city: 'Sao Paulo',
            state: 'SP',
            wallet: { create: { balance } },
          },
        },
      },
      include: { venue: true },
    });
    const venue = user.venue;
    if (!venue) throw new Error('venue ausente');
    const base = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const rows: Array<{ purchaseId: string; orderId: string }> = [];
    for (let index = 0; index < count; index += 1) {
      const id = orderId();
      const purchase = await db.creditPurchase.create({
        data: {
          venueId: venue.id,
          packageKey: 'unit_1',
          amountPaid: AMOUNT,
          currency: 'BRL',
          credits: 1,
          status: 'PAID',
          provider: 'card',
          providerTxId: `card:${id}`,
          confirmedAt: new Date(base.getTime() + index * 1000),
        },
      });
      rows.push({ purchaseId: purchase.id, orderId: id });
    }
    return { userId: user.id, venueId: venue.id, rows };
  }

  async function lockRow() {
    const rows = await prisma.$queryRaw<
      Array<{
        lockedBy: string;
        cursorPurchaseId: string | null;
        cooldownUntilMs: number | null;
        held: boolean;
      }>
    >`
      SELECT "lockedBy",
             "cursorPurchaseId",
             (EXTRACT(EPOCH FROM ("cooldownUntil" AT TIME ZONE 'UTC')) * 1000) AS "cooldownUntilMs",
             ("lockedUntil" > NOW()) AS held
      FROM "CardReconcileLock"
      WHERE id = 1
    `;
    const row = rows[0];
    if (!row) return row;
    return {
      lockedBy: row.lockedBy,
      cursorPurchaseId: row.cursorPurchaseId,
      held: row.held,
      cooldownUntil:
        row.cooldownUntilMs == null ? null : new Date(Number(row.cooldownUntilMs)),
    };
  }

  it('ordem paga sem reembolso consulta uma compra e nao altera saldo nem auditoria', async () => {
    const harness = service();
    const confirmedAt = new Date(Date.now() - 20 * 60 * 1000);
    const eligible = await seed({
      status: 'PAID',
      credits: 1,
      balance: 3,
      confirmedAt,
    });
    const refundedOrder = orderId();
    const refunded = await prisma.creditPurchase.create({
      data: {
        venueId: eligible.venueId,
        packageKey: 'unit_1',
        amountPaid: AMOUNT,
        currency: 'BRL',
        credits: 1,
        status: 'REFUNDED',
        provider: 'card',
        providerTxId: `card:${refundedOrder}`,
        confirmedAt: new Date(confirmedAt.getTime() - 60_000),
      },
    });
    const seen: string[] = [];
    harness.card.getOrder = async (requested) => {
      seen.push(requested);
      return cardOrder(eligible.purchaseId, requested, 'PAID', 'none');
    };
    const purchaseBefore = await prisma.creditPurchase.findUniqueOrThrow({
      where: { id: eligible.purchaseId },
    });
    const walletBefore = await prisma.creditWallet.findUniqueOrThrow({
      where: { venueId: eligible.venueId },
    });
    const auditsBefore = await prisma.creditRefundAudit.count({
      where: { purchaseId: eligible.purchaseId },
    });

    const result = await harness.credits.reconcilePaidCardPurchases(new Date());

    const purchaseAfter = await prisma.creditPurchase.findUniqueOrThrow({
      where: { id: eligible.purchaseId },
    });
    const walletAfter = await prisma.creditWallet.findUniqueOrThrow({
      where: { venueId: eligible.venueId },
    });
    const auditsAfter = await prisma.creditRefundAudit.count({
      where: { purchaseId: eligible.purchaseId },
    });
    const refundedAfter = await prisma.creditPurchase.findUniqueOrThrow({
      where: { id: refunded.id },
    });
    const lock = await lockRow();

    expect(result).toMatchObject({
      skipped: false,
      skipReason: null,
      checked: 1,
      refunded: 0,
      partial: 0,
      errors: 0,
      timeouts: 0,
      rateLimited: 0,
      leaseLost: false,
    });
    expect(seen).toEqual([eligible.orderId]);
    expect(purchaseAfter.status).toBe('PAID');
    expect(purchaseAfter.updatedAt.getTime()).toBe(purchaseBefore.updatedAt.getTime());
    expect(walletAfter.balance).toBe(3);
    expect(walletAfter.updatedAt.getTime()).toBe(walletBefore.updatedAt.getTime());
    expect(auditsAfter).toBe(auditsBefore);
    expect(refundedAfter.status).toBe('REFUNDED');
    expect(refundedAfter.updatedAt.getTime()).toBe(refunded.updatedAt.getTime());
    expect(lock?.cursorPurchaseId).toBeNull();
    expect(lock?.held).toBe(false);
    expect(lock?.lockedBy).toBe('');
    expect(lock?.cooldownUntil).toBeNull();
  });

  it('avanca o cursor em lotes e reinicia no fim da fila', async () => {
    const harness = service();
    const fixture = await seedMany(25);
    const seen: string[] = [];
    harness.card.getOrder = async (requested) => {
      seen.push(requested);
      const row = fixture.rows.find((item) => item.orderId === requested);
      if (!row) throw new Error('pedido desconhecido');
      return cardOrder(row.purchaseId, requested, 'PAID', 'none');
    };

    const first = await harness.credits.reconcilePaidCardPurchases(new Date());
    const mid = await lockRow();
    const second = await harness.credits.reconcilePaidCardPurchases(new Date());
    const wrapped = await lockRow();
    const third = await harness.credits.reconcilePaidCardPurchases(new Date());

    expect(first.checked).toBe(20);
    expect(mid?.cursorPurchaseId).toBe(fixture.rows[19].purchaseId);
    expect(second.checked).toBe(5);
    expect(wrapped?.cursorPurchaseId).toBeNull();
    expect(third.checked).toBe(20);
    expect(seen.slice(0, 25).map((id) => id)).toEqual(fixture.rows.map((row) => row.orderId));
    expect(seen[25]).toBe(fixture.rows[0].orderId);
    const stillPaid = await prisma.creditPurchase.count({
      where: { venueId: fixture.venueId, status: 'PAID' },
    });
    expect(stillPaid).toBe(25);
  });

  it('um servico novo continua do cursor gravado', async () => {
    const firstHarness = service();
    const fixture = await seedMany(30);
    const seen: string[] = [];
    const respond = async (requested: string) => {
      seen.push(requested);
      const row = fixture.rows.find((item) => item.orderId === requested);
      if (!row) throw new Error('pedido desconhecido');
      return cardOrder(row.purchaseId, requested, 'PAID', 'none');
    };
    firstHarness.card.getOrder = respond;
    await firstHarness.credits.reconcilePaidCardPurchases(new Date());
    const stored = await lockRow();

    const restarted = service();
    restarted.card.getOrder = respond;
    const result = await restarted.credits.reconcilePaidCardPurchases(new Date());
    const after = await lockRow();

    expect(stored?.cursorPurchaseId).toBe(fixture.rows[19].purchaseId);
    expect(result.checked).toBe(10);
    expect(seen[0]).toBe(fixture.rows[0].orderId);
    expect(seen[20]).toBe(fixture.rows[20].orderId);
    expect(seen).toHaveLength(30);
    expect(after?.cursorPurchaseId).toBeNull();
  });

  it('renova o lease entre compras', async () => {
    const harness = service();
    const fixture = await seedMany(2);
    const stamps: Date[] = [];
    harness.card.getOrder = async (requested) => {
      const row = await prisma.$queryRaw<Array<{ lockedUntil: Date; lockedBy: string }>>`
        SELECT "lockedUntil", "lockedBy" FROM "CardReconcileLock" WHERE id = 1
      `;
      stamps.push(row[0].lockedUntil);
      expect(row[0].lockedBy).not.toBe('');
      await new Promise((resolve) => setTimeout(resolve, 80));
      const match = fixture.rows.find((item) => item.orderId === requested);
      if (!match) throw new Error('pedido desconhecido');
      return cardOrder(match.purchaseId, requested, 'PAID', 'none');
    };

    const result = await harness.credits.reconcilePaidCardPurchases(new Date());
    const after = await lockRow();

    expect(result.checked).toBe(2);
    expect(stamps[1].getTime()).toBeGreaterThan(stamps[0].getTime());
    expect(after?.lockedBy).toBe('');
    expect(after?.held).toBe(false);
  });

  it('perda do lease antes do estorno preserva compra, saldo e cursor', async () => {
    const harness = service();
    const fixture = await seed({
      status: 'PAID',
      credits: 5,
      balance: 8,
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    const extra = orderId();
    await prisma.creditPurchase.create({
      data: {
        venueId: fixture.venueId,
        packageKey: 'unit_1',
        amountPaid: AMOUNT,
        currency: 'BRL',
        credits: 1,
        status: 'PAID',
        provider: 'card',
        providerTxId: `card:${extra}`,
        confirmedAt: new Date(Date.now() - 19 * 60 * 1000),
      },
    });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    const seen: string[] = [];
    harness.card.getOrder = async (requested) => {
      seen.push(requested);
      await prisma.$executeRaw`
        UPDATE "CardReconcileLock"
        SET "lockedUntil" = TIMESTAMP '1970-01-01 00:00:00'
        WHERE id = 1
      `;
      return cardOrder(fixture.purchaseId, requested, 'REFUNDED', 'full');
    };

    const result = await harness.credits.reconcilePaidCardPurchases(new Date());
    const after = await snapshot(fixture.purchaseId, fixture.venueId);
    const lock = await lockRow();
    log('lease-antes-do-estorno', before, after);

    expect(result.refunded).toBe(0);
    expect(seen).toEqual([fixture.orderId]);
    expect(after).toEqual(before);
    expect(lock?.cursorPurchaseId).toBeNull();
    expect(lock?.lockedBy).toBe('');
  });

  it('perda do lease dentro da transacao nao liquida o estorno', async () => {
    const harness = service();
    const fixture = await seed({
      status: 'PAID',
      credits: 5,
      balance: 8,
      confirmedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    const before = await snapshot(fixture.purchaseId, fixture.venueId);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RefundTxProbe" (
        id int PRIMARY KEY,
        skips int NOT NULL
      )
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "RefundTxProbe" (id, skips) VALUES (1, 0)
      ON CONFLICT (id) DO UPDATE SET skips = 0
    `);
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION refund_tx_skip_reconcile_claim()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        IF current_query() ILIKE '%RETURNING%'
           AND OLD."lockedBy" IS NOT DISTINCT FROM NEW."lockedBy"
           AND OLD."lockedBy" <> '' THEN
          UPDATE "RefundTxProbe" SET skips = skips + 1 WHERE id = 1;
          RETURN NULL;
        END IF;
        RETURN NEW;
      END;
      $fn$
    `);
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS refund_tx_skip_reconcile_claim ON "CardReconcileLock"
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER refund_tx_skip_reconcile_claim
      BEFORE UPDATE ON "CardReconcileLock"
      FOR EACH ROW
      EXECUTE FUNCTION refund_tx_skip_reconcile_claim()
    `);
    harness.card.getOrder = async (requested) =>
      cardOrder(fixture.purchaseId, requested, 'REFUNDED', 'full');

    try {
      const result = await harness.credits.reconcilePaidCardPurchases(new Date());
      const after = await snapshot(fixture.purchaseId, fixture.venueId);
      const skips = await prisma.$queryRawUnsafe<Array<{ skips: number }>>(
        'SELECT skips FROM "RefundTxProbe" WHERE id = 1',
      );
      const lock = await lockRow();
      log('lease-dentro-da-transacao', before, after);
      expect(result.refunded).toBe(0);
      expect(Number(skips[0]?.skips)).toBe(1);
      expect(after).toEqual(before);
      expect(lock?.cursorPurchaseId).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS refund_tx_skip_reconcile_claim ON "CardReconcileLock"',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS refund_tx_skip_reconcile_claim()');
      await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "RefundTxProbe"');
    }
  });

  it('HTTP 429 grava cooldown e a pausa termina', async () => {
    const harness = service();
    const fixture = await seedMany(2, 4);
    let calls = 0;
    harness.card.getOrder = async () => {
      calls += 1;
      throw new CardReconcileRateLimitError('30');
    };
    const before = Date.now();
    const blocked = await harness.credits.reconcilePaidCardPurchases(new Date());
    const cooling = await lockRow();
    const restarted = service();
    restarted.card.getOrder = harness.card.getOrder;
    const during = await restarted.credits.reconcilePaidCardPurchases(new Date());
    const later = await restarted.credits.reconcilePaidCardPurchases(
      new Date(Date.now() + 45_000),
    );
    const paid = await prisma.creditPurchase.count({
      where: { venueId: fixture.venueId, status: 'PAID' },
    });

    expect(blocked.errors).toBe(1);
    expect(blocked.checked).toBe(1);
    expect(calls).toBe(2);
    expect(during.skipped).toBe(true);
    expect(later.skipped).toBe(false);
    expect(later.checked).toBe(1);
    expect(cooling?.cursorPurchaseId).toBeNull();
    const cooldown = cooling?.cooldownUntil?.getTime() ?? 0;
    expect(cooldown).toBeGreaterThanOrEqual(before + 29_000);
    expect(cooldown).toBeLessThan(before + 40_000);
    expect(paid).toBe(2);
    const balance = await prisma.creditWallet.findUniqueOrThrow({
      where: { venueId: fixture.venueId },
    });
    expect(balance.balance).toBe(4);
  });

  it('timeout e HTTP 5xx preservam as compras e seguem o cursor', async () => {
    const harness = service();
    const fixture = await seedMany(21);
    const seen: string[] = [];
    harness.card.getOrder = async (requested) => {
      seen.push(requested);
      if (seen.length === 1) throw new CardReconcileTransportError('timeout');
      if (seen.length === 2) throw new CardReconcileTransportError('unavailable');
      const row = fixture.rows.find((item) => item.orderId === requested);
      if (!row) throw new Error('pedido desconhecido');
      return cardOrder(row.purchaseId, requested, 'PAID', 'none');
    };

    const first = await harness.credits.reconcilePaidCardPurchases(new Date());
    const cursor = await lockRow();
    const second = await harness.credits.reconcilePaidCardPurchases(new Date());
    const statuses = await prisma.creditPurchase.findMany({
      where: { venueId: fixture.venueId },
      select: { status: true },
    });

    expect(first).toMatchObject({ checked: 20, errors: 2, refunded: 0 });
    expect(seen).toHaveLength(21);
    expect(seen[0]).toBe(fixture.rows[0].orderId);
    expect(seen[20]).toBe(fixture.rows[20].orderId);
    expect(cursor?.cursorPurchaseId).toBe(fixture.rows[19].purchaseId);
    expect(second.checked).toBe(1);
    expect(statuses.every((row) => row.status === 'PAID')).toBe(true);
  });

  it('consulta so o cartao pago antigo e ignora outros provedores, status e cooldown', async () => {
    const existing = await prisma.creditPurchase.count();
    expect(existing).toBe(0);
    const harness = service();
    const eligibleAt = new Date(Date.now() - 11 * 60 * 1000);
    const recentAt = new Date(Date.now() - 9 * 60 * 1000);
    const eligible = await seed({
      status: 'PAID',
      credits: 1,
      balance: 4,
      confirmedAt: eligibleAt,
    });
    const extras: Array<{
      provider: string;
      status: PurchaseStatus;
      confirmedAt: Date | null;
    }> = [
      { provider: 'card', status: 'PAID', confirmedAt: recentAt },
      { provider: 'card', status: 'PENDING', confirmedAt: eligibleAt },
      { provider: 'card', status: 'FAILED', confirmedAt: eligibleAt },
      { provider: 'card', status: 'REFUNDED', confirmedAt: eligibleAt },
      { provider: 'card', status: 'CANCELLED', confirmedAt: eligibleAt },
      { provider: 'card', status: 'PAID', confirmedAt: null },
      { provider: 'pix', status: 'PAID', confirmedAt: eligibleAt },
      { provider: 'google_play', status: 'PAID', confirmedAt: eligibleAt },
      { provider: 'app_store', status: 'PAID', confirmedAt: eligibleAt },
    ];
    for (let index = 0; index < 25; index += 1) {
      extras.push({ provider: 'pix', status: 'PAID', confirmedAt: eligibleAt });
    }
    for (const extra of extras) {
      await prisma.creditPurchase.create({
        data: {
          venueId: eligible.venueId,
          packageKey: 'unit_1',
          amountPaid: AMOUNT,
          currency: 'BRL',
          credits: 1,
          status: extra.status,
          provider: extra.provider,
          providerTxId: `${extra.provider}:${randomUUID()}`,
          confirmedAt: extra.confirmedAt,
        },
      });
    }
    const seen: string[] = [];
    harness.card.getOrder = async (requested) => {
      seen.push(requested);
      return cardOrder(eligible.purchaseId, requested, 'REFUNDED', 'full');
    };

    await prisma.$executeRaw`
      UPDATE "CardReconcileLock"
      SET "cooldownUntil" = (${new Date(Date.now() + 10 * 60 * 1000)}::timestamptz AT TIME ZONE 'UTC')
      WHERE id = 1
    `;
    const paused = await harness.credits.reconcilePaidCardPurchases(new Date());
    expect(paused).toMatchObject({ skipped: true, skipReason: 'cooldown', checked: 0 });
    expect(seen).toEqual([]);

    await prisma.$executeRaw`
      UPDATE "CardReconcileLock"
      SET "cooldownUntil" = NULL
      WHERE id = 1
    `;
    const first = await harness.credits.reconcilePaidCardPurchases(new Date());
    const second = await harness.credits.reconcilePaidCardPurchases(new Date());

    expect(first).toMatchObject({ checked: 1, refunded: 1, errors: 0 });
    expect(second.checked).toBe(0);
    expect(seen).toEqual([eligible.orderId]);
    const after = await snapshot(eligible.purchaseId, eligible.venueId);
    expect(after.status).toBe('REFUNDED');
    expect(after.balance).toBe(3);
    const untouched = await prisma.creditPurchase.findMany({
      where: { venueId: eligible.venueId, id: { not: eligible.purchaseId } },
      select: { provider: true, status: true },
    });
    expect(untouched).toHaveLength(extras.length);
    const changed = untouched.filter(
      (row) =>
        (row.provider === 'pix' && row.status !== 'PAID') ||
        (row.provider === 'google_play' && row.status !== 'PAID') ||
        (row.provider === 'app_store' && row.status !== 'PAID'),
    );
    expect(changed).toEqual([]);
    const otherCards = await prisma.creditPurchase.findMany({
      where: {
        venueId: eligible.venueId,
        provider: 'card',
        id: { not: eligible.purchaseId },
      },
      select: { status: true, confirmedAt: true },
    });
    expect(otherCards.map((row) => row.status).sort()).toEqual(
      ['CANCELLED', 'FAILED', 'PAID', 'PAID', 'PENDING', 'REFUNDED'].sort(),
    );
  });

  it('dashboard isola o parcial e o integral no cenario de duas vendas de 34,90', async () => {
    const existing = await prisma.creditPurchase.count();
    expect(existing).toBe(0);
    const confirmedAt = new Date('2026-10-02T15:00:00.000Z');
    const harness = service();
    const target = await seed({
      status: 'PAID',
      credits: 1,
      balance: 1,
      confirmedAt,
    });
    const other = await seed({
      status: 'PAID',
      credits: 1,
      balance: 1,
      confirmedAt,
    });
    const range = monthRangeUtc({ year: 2026, month: 10 });
    const position = async () => {
      const [sales, fullRefunds, partialRefunds, refundReviewsOpen] = await Promise.all([
        salesByProviderInRange(prisma as never, range.start, range.end),
        fullRefundsInRange(prisma as never, range.start, range.end),
        partialRefundsInRange(prisma as never, range.start, range.end),
        openRefundReviewsInRange(prisma as never, range.start, range.end),
      ]);
      return {
        reviews: refundReviewsOpen,
        ...buildRefundPosition({
          yearMonth: '2026-10',
          paid: new Prisma.Decimal(sales.grossRevenueBrl.toFixed(2)),
          fullRefunds,
          partialKnown: partialRefunds.known,
          partialsWithoutAmount: partialRefunds.unknown,
          refundReviewsOpen,
        }),
      };
    };

    armWebhook(harness, target.purchaseId, target.orderId, async () =>
      partialOrder(target.purchaseId, target.orderId, 10, 'REF-10'),
    );
    await webhook(harness);
    await webhook(harness);
    const during = await position();
    expect(during.paidSalesBrl).toBe(69.8);
    expect(during.partialRefundsBrl).toBe(10);
    expect(during.fullRefundsBrl).toBe(0);
    expect(during.revenueAfterRefundsBrl).toBe(59.8);
    expect(during.reviews).toBe(0);
    expect(await partialAmount(target.purchaseId)).toBe(10);

    armWebhook(harness, target.purchaseId, target.orderId, async () => ({
      orderId: target.orderId,
      paymentId: 'PAY-REVIEW',
      status: 'REFUNDED',
      amountBrl: AMOUNT,
      currency: 'BRL',
      externalReference: target.purchaseId,
      installments: 1,
      paymentType: 'credit_card',
      paymentMethodId: 'visa',
      refundScope: 'review',
      refundedAmountBrl: null,
      refundId: null,
    }));
    await webhook(harness);
    const hidden = await position();
    const reviewRows = await prisma.creditRefundAudit.count({
      where: { purchaseId: target.purchaseId, kind: 'refund_review' },
    });
    expect(reviewRows).toBe(1);
    expect(hidden.reviews).toBe(1);
    expect(hidden.partialRefundsBrl).toBe(10);
    expect((await snapshot(target.purchaseId, target.venueId)).balance).toBe(1);
    expect((await snapshot(target.purchaseId, target.venueId)).status).toBe('PAID');

    armWebhook(harness, target.purchaseId, target.orderId, async () =>
      partialOrder(target.purchaseId, target.orderId, 24.9, 'REF-24'),
    );
    await webhook(harness);
    expect(await partialAmount(target.purchaseId)).toBe(24.9);
    const raised = await position();
    expect(raised.partialRefundsBrl).toBe(24.9);
    expect(raised.paidSalesBrl).toBe(69.8);
    expect(raised.revenueAfterRefundsBrl).toBe(44.9);
    expect(raised.reviews).toBe(1);

    armWebhook(harness, target.purchaseId, target.orderId, async () =>
      cardOrder(target.purchaseId, target.orderId, 'REFUNDED', 'full'),
    );
    await webhook(harness);
    await webhook(harness);
    const after = await position();
    const targetAfter = await snapshot(target.purchaseId, target.venueId);
    const otherAfter = await snapshot(other.purchaseId, other.venueId);
    expect(targetAfter).toMatchObject({ status: 'REFUNDED', balance: 0 });
    expect(otherAfter).toMatchObject({ status: 'PAID', balance: 1 });
    expect(await partialAmount(target.purchaseId)).toBe(24.9);
    expect(after.paidSalesBrl).toBe(34.9);
    expect(after.partialRefundsBrl).toBe(0);
    expect(after.fullRefundsBrl).toBe(34.9);
    expect(after.revenueAfterRefundsBrl).toBe(34.9);
    expect(after.reviews).toBe(0);
  });

  it('revisao aberta ignora so o parcial posterior e o periodo da compra', async () => {
    expect(await prisma.creditPurchase.count()).toBe(0);
    const october = new Date('2026-10-02T15:00:00.000Z');
    const september = new Date('2026-09-02T15:00:00.000Z');
    const earlier = new Date('2026-10-03T12:00:00.000Z');
    const later = new Date('2026-10-05T12:00:00.000Z');
    const octoberRange = monthRangeUtc({ year: 2026, month: 10 });
    const septemberRange = monthRangeUtc({ year: 2026, month: 9 });
    const paidA = await seed({ status: 'PAID', credits: 1, balance: 1, confirmedAt: october });
    const paidB = await seed({ status: 'PAID', credits: 1, balance: 1, confirmedAt: october });
    const onlyReview = await seed({ status: 'PAID', credits: 1, balance: 1, confirmedAt: october });
    const resolved = await seed({ status: 'PAID', credits: 1, balance: 1, confirmedAt: october });
    const refunded = await seed({ status: 'PAID', credits: 1, balance: 1, confirmedAt: october });
    const otherMonth = await seed({ status: 'PAID', credits: 1, balance: 1, confirmedAt: september });
    const otherVenue = await seed({ status: 'PAID', credits: 1, balance: 1, confirmedAt: october });
    await prisma.creditPurchase.update({
      where: { id: refunded.purchaseId },
      data: { status: 'REFUNDED' },
    });
    const write = async (
      row: { purchaseId: string; venueId: string },
      kind: string,
      createdAt: Date,
      amount?: number,
    ) => {
      await prisma.creditRefundAudit.create({
        data: {
          purchaseId: row.purchaseId,
          venueId: row.venueId,
          kind,
          refundedAmount: amount == null ? undefined : amount,
          createdAt,
        },
      });
    };
    await write(paidA, 'partial_review', earlier, 10);
    await write(paidA, 'refund_review', later);
    await write(onlyReview, 'refund_review', earlier);
    await write(resolved, 'refund_review', earlier);
    await write(resolved, 'partial_review', later, 10);
    await write(refunded, 'partial_review', earlier, 10);
    await write(refunded, 'refund_review', later);
    await write(otherMonth, 'refund_review', later);
    await write(otherVenue, 'refund_review', new Date('2026-09-01T12:00:00.000Z'));
    await expect(
      prisma.creditRefundAudit.create({
        data: {
          purchaseId: onlyReview.purchaseId,
          venueId: onlyReview.venueId,
          kind: 'refund_review',
          createdAt: later,
        },
      }),
    ).rejects.toThrow();

    const octoberReviews = await openRefundReviewsInRange(
      prisma as never,
      octoberRange.start,
      octoberRange.end,
    );
    const septemberReviews = await openRefundReviewsInRange(
      prisma as never,
      septemberRange.start,
      septemberRange.end,
    );
    const sales = await salesByProviderInRange(
      prisma as never,
      octoberRange.start,
      octoberRange.end,
    );
    const fullRefunds = await fullRefundsInRange(
      prisma as never,
      octoberRange.start,
      octoberRange.end,
    );
    const partialRefunds = await partialRefundsInRange(
      prisma as never,
      octoberRange.start,
      octoberRange.end,
    );
    const position = buildRefundPosition({
      yearMonth: '2026-10',
      paid: new Prisma.Decimal(sales.grossRevenueBrl.toFixed(2)),
      fullRefunds,
      partialKnown: partialRefunds.known,
      partialsWithoutAmount: partialRefunds.unknown,
      refundReviewsOpen: octoberReviews,
    });

    expect(octoberReviews).toBe(3);
    expect(septemberReviews).toBe(1);
    expect(position.paidSalesBrl).toBe(174.5);
    expect(position.partialRefundsBrl).toBe(20);
    expect(position.fullRefundsBrl).toBe(34.9);
    expect(position.revenueAfterRefundsBrl).toBe(154.5);
    expect(position.refundReviewsOpen).toBe(3);
    const balances = await prisma.creditWallet.findMany({
      where: {
        venueId: {
          in: [
            paidA.venueId,
            paidB.venueId,
            onlyReview.venueId,
            resolved.venueId,
            refunded.venueId,
            otherMonth.venueId,
            otherVenue.venueId,
          ],
        },
      },
    });
    expect(balances).toHaveLength(7);
    expect(balances.every((row) => row.balance === 1)).toBe(true);
    expect(
      (await prisma.creditPurchase.findUnique({ where: { id: paidA.purchaseId } }))?.status,
    ).toBe('PAID');
    expect(
      await prisma.creditRefundAudit.count({
        where: { purchaseId: refunded.purchaseId },
      }),
    ).toBe(2);
  });

  function zoneClient(zone: 'UTC' | 'America/Sao_Paulo'): PrismaClient {
    const raw = process.env.DATABASE_URL;
    assertIsolatedUrl(raw);
    const probe = new URL(String(raw).replace(/^postgres(ql)?:/i, 'http:'));
    const name = decodeURIComponent(probe.pathname.replace(/^\//, ''));
    if (name !== TEST_DATABASE) throw new Error(`banco recusado: ${name}`);
    const protocol = String(raw).startsWith('postgresql:') ? 'postgresql:' : 'postgres:';
    const user = decodeURIComponent(probe.username);
    const password = decodeURIComponent(probe.password);
    const port = probe.port || '5432';
    const options = encodeURIComponent(`-c TimeZone=${zone}`);
    const url = `${protocol}//${user}:${password}@${probe.hostname}:${port}/${name}?schema=public&options=${options}`;
    return new PrismaClient({ datasources: { db: { url } } });
  }

  it('cursor e cooldown coincidem em UTC e America/Sao_Paulo', async () => {
    const sequences: number[][] = [];
    const cooldownDeltas: number[] = [];
    const clients: PrismaClient[] = [];
    try {
      for (const zone of ['UTC', 'America/Sao_Paulo'] as const) {
        const db = zoneClient(zone);
        clients.push(db);
        await db.$connect();
        const meta = await db.$queryRaw<Array<{ db: string; tz: string }>>`
          SELECT current_database() AS db, current_setting('TIMEZONE') AS tz
        `;
        expect(meta[0]?.db).toBe(TEST_DATABASE);
        expect(meta[0]?.tz).toBe(zone);
        await db.user.deleteMany({
          where: { email: { endsWith: '@refund-tx.test' } },
        });
        await db.$executeRaw`
          UPDATE "CardReconcileLock"
          SET "lockedUntil" = TIMESTAMP '1970-01-01 00:00:00',
              "lockedBy" = '',
              "cursorConfirmedAt" = NULL,
              "cursorPurchaseId" = NULL,
              "cooldownUntil" = NULL
          WHERE id = 1
        `;
        const fixture = await seedMany(21, 0, db);
        const seen: number[] = [];
        const harness = service(db);
        harness.card.getOrder = async (requested: string) => {
          const index = fixture.rows.findIndex((row) => row.orderId === requested);
          seen.push(index);
          return cardOrder(fixture.rows[index].purchaseId, requested, 'PAID', 'none');
        };

        const first = await harness.credits.reconcilePaidCardPurchases(new Date());
        const cursor = await db.$queryRaw<
          Array<{ id: string | null; ms: number | null }>
        >`
          SELECT "cursorPurchaseId" AS id,
                 (EXTRACT(EPOCH FROM ("cursorConfirmedAt" AT TIME ZONE 'UTC')) * 1000) AS ms
          FROM "CardReconcileLock"
          WHERE id = 1
        `;
        const stored = await db.creditPurchase.findUniqueOrThrow({
          where: { id: fixture.rows[19].purchaseId },
        });
        expect(first.checked).toBe(20);
        expect(first.leaseLost).toBe(false);
        expect(cursor[0]?.id).toBe(fixture.rows[19].purchaseId);
        expect(
          Math.abs(Number(cursor[0]?.ms) - (stored.confirmedAt?.getTime() ?? 0)),
        ).toBeLessThan(2);

        const second = await harness.credits.reconcilePaidCardPurchases(new Date());
        expect(second.checked).toBe(1);
        expect(seen).toEqual([...Array(21).keys()]);
        sequences.push(seen);

        await db.$executeRaw`
          UPDATE "CardReconcileLock"
          SET "cooldownUntil" = NULL,
              "cursorConfirmedAt" = NULL,
              "cursorPurchaseId" = NULL
          WHERE id = 1
        `;
        harness.card.getOrder = async () => {
          throw new CardReconcileRateLimitError('120');
        };
        const before = Date.now();
        const blocked = await harness.credits.reconcilePaidCardPurchases(new Date());
        const cool = await db.$queryRaw<Array<{ ms: number }>>`
          SELECT (EXTRACT(EPOCH FROM ("cooldownUntil" AT TIME ZONE 'UTC')) * 1000) AS ms
          FROM "CardReconcileLock"
          WHERE id = 1
        `;
        const delta = Number(cool[0]?.ms) - before;
        expect(blocked.rateLimited).toBe(1);
        expect(blocked.refunded).toBe(0);
        expect(delta).toBeGreaterThanOrEqual(119_000);
        expect(delta).toBeLessThan(130_000);
        cooldownDeltas.push(delta);
        const paid = await db.creditPurchase.count({
          where: { venueId: fixture.venueId, status: 'PAID' },
        });
        expect(paid).toBe(21);
      }
      expect(sequences[0]).toEqual(sequences[1]);
      expect(Math.abs(cooldownDeltas[0] - cooldownDeltas[1])).toBeLessThan(2_000);
    } finally {
      await Promise.all(clients.map((db) => db.$disconnect().catch(() => undefined)));
    }
  });
});
