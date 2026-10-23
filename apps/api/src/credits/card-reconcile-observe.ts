import { PrismaClient } from '@prisma/client';
import {
  CARD_PAID_RECONCILE_MIN_AGE_MS,
  CARD_RECONCILE_GET_TIMEOUT_MS,
} from './card-refund.ledger';
import { asMoney } from './purchase-public';
import {
  CardVerifiedOrder,
  cardRefundAction,
  decidePaidCardReconcileAction,
  describeCardRefunds,
  parseCardOrder,
  sanitizeCardExternalReference,
} from './providers/card.provider';
import {
  MercadoPagoNetworkError,
  MercadoPagoTimeoutError,
  MercadoPagoTransportKind,
  classifyMercadoPagoNetworkFailure,
  readMercadoPagoOrderEnvelope,
  sanitizeProviderError,
} from './providers/mercado-pago-orders';
import { cardOrderIdFromProviderTxId } from './providers/payment-provider';

/** Seller confirmed on the Sandbox test account. Observation refuses any other id. */
export const CARD_OBSERVE_EXPECTED_SELLER_ID = '3644088586';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export type CardObserveFailureDetail = {
  endpoint?: string;
  elapsedMs?: number;
  httpStatus?: number;
  sanitizedMessage?: string;
};

export class CardObserveStopped extends Error {
  constructor(
    readonly reason: string,
    readonly detail?: CardObserveFailureDetail,
  ) {
    super(reason);
    this.name = 'CardObserveStopped';
  }
}

export type CardObserveEnv = {
  databaseUrl?: string;
  sandbox: boolean;
  production: boolean;
  reconcileEnabled: boolean;
  accessToken?: string;
};

export type CardObservePurchase = {
  id: string;
  status: string;
  amountPaid: string;
  currency: string;
  credits: number;
  provider: string | null;
  providerTxId: string | null;
  confirmedAt: Date | null;
  updatedAt: Date;
  venueName: string;
  balance: number | null;
  walletUpdatedAt: Date | null;
  auditCount: number;
};

export type CardObserveLock = {
  held: boolean;
  cursorPurchaseId: string | null;
  cooldownUntil: Date | null;
  lockedUntil: Date;
};

export type CardObserveDb = {
  server(): Promise<{ name: string; addr: string | null; port: number }>;
  purchase(id: string): Promise<CardObservePurchase | null>;
  lock(): Promise<CardObserveLock | null>;
};

export type CardObserveHttpResult = {
  status: number;
  data: unknown;
  retryAfter?: string | null;
};

export type CardObserveHttp = {
  getCurrentUser(token: string, timeoutMs: number): Promise<CardObserveHttpResult>;
  getOrder(
    token: string,
    orderId: string,
    timeoutMs: number,
  ): Promise<CardObserveHttpResult>;
};

export type CardObserveReport = {
  ok: boolean;
  purchaseId: string;
  eligible: boolean;
  purchase: {
    status: string;
    amountPaid: string;
    currency: string;
    credits: number;
    provider: string | null;
    orderId: string;
    venueName: string;
    balance: number | null;
    walletUpdatedAt: string | null;
    updatedAt: string;
    auditCount: number;
  };
  account: { sellerId: string; testUser: true } | null;
  lock: {
    held: boolean;
    cursorPurchaseId: string | null;
    cooldownUntil: string | null;
    lockedUntil: string;
  } | null;
  transport: 'rate_limit' | 'timeout' | 'unavailable' | 'retry' | null;
  order: {
    id: string;
    status: string | null;
    statusDetail: string | null;
    externalReference: string | null;
    currency: string | null;
    totalAmount: string | null;
  } | null;
  payment: {
    id: string | null;
    status: string | null;
    statusDetail: string | null;
    type: string | null;
  } | null;
  refunds: Array<{
    id: string | null;
    status: string | null;
    amount: string | null;
    transactionId: string | null;
  }>;
  processedRefundBrl: number | null;
  assessment: {
    refundScope: 'none' | 'partial' | 'full' | 'review';
    refundedAmountBrl: number | null;
    refundId: string | null;
  } | null;
  refundAction: 'full' | 'partial' | 'review' | 'confirm' | 'terminal' | 'pending' | null;
  matchesPurchase: boolean | null;
  divergences: string[];
  hypothetical: {
    settlement: 'none' | 'review' | 'partial' | 'full';
    label: string;
    wouldChangeStatus: boolean;
    wouldWriteAudit: boolean;
    wouldDebitCredits: boolean;
    projectedDebit: number;
    projectedShortfall: number;
  };
};

export function parseObservePurchaseId(argv: string[]): string {
  const args = argv.slice(2).filter((arg) => arg !== '--');
  if (args.length !== 1) throw new CardObserveStopped('compra_ausente');
  const id = args[0]?.trim() ?? '';
  if (!id || id === 'all' || id.includes('*') || id.startsWith('-')) {
    throw new CardObserveStopped('compra_invalida');
  }
  return id;
}

export function assertObserveDatabaseUrl(raw: string | undefined): void {
  if (!raw?.trim()) throw new CardObserveStopped('banco_recusado');
  let host = '';
  let port = '';
  let name = '';
  try {
    const url = new URL(raw.trim().replace(/^postgres(ql)?:/i, 'http:'));
    host = url.hostname.toLowerCase();
    port = url.port || '5432';
    name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw new CardObserveStopped('banco_recusado');
  }
  if (!LOCAL_HOSTS.has(host) || port !== '5432' || name !== 'after') {
    throw new CardObserveStopped('banco_recusado');
  }
}

function localServer(addr: string | null, port: number): boolean {
  if (port !== 5432) return false;
  if (!addr) return true;
  return addr.startsWith('127.0.0.1') || addr.startsWith('::1');
}

function tokenAccepted(token: string | undefined): boolean {
  const trimmed = token?.trim() ?? '';
  return trimmed.startsWith('TEST-') || trimmed.startsWith('APP_USR-');
}

const ACCOUNT_ENDPOINT = 'GET /users/me';

function accountRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const nested = record.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return record;
}

function accountOf(
  data: unknown,
): { kind: 'invalid' } | { kind: 'account'; id: string | null; testUser: boolean } {
  const record = accountRecord(data);
  if (!record) return { kind: 'invalid' };
  const hasId = record.id != null && String(record.id).trim() !== '';
  const tags = Array.isArray(record.tags) ? record.tags : [];
  if (!hasId && tags.length === 0) return { kind: 'invalid' };
  return {
    kind: 'account',
    id: hasId ? String(record.id) : null,
    testUser: tags.some((tag) => String(tag) === 'test_user'),
  };
}

function accountHttpReason(status: number): string {
  if (status === 401) return 'account_http_401';
  if (status === 403) return 'account_http_403';
  if (status === 429) return 'account_http_429';
  if (status >= 500) return 'account_http_5xx';
  return `account_http_${status}`;
}

function accountTransportReason(kind: MercadoPagoTransportKind): string {
  if (kind === 'timeout') return 'account_timeout';
  if (kind === 'dns') return 'account_dns_error';
  if (kind === 'connection') return 'account_connection_error';
  if (kind === 'tls') return 'account_tls_error';
  return 'account_unknown_error';
}

function clippedErrorMessage(error: unknown): string | undefined {
  const raw = error instanceof Error ? error.message : '';
  const text = sanitizeProviderError(raw).replace(/\s+/g, ' ').trim().slice(0, 120);
  return text || undefined;
}

function stopAccount(
  reason: string,
  started: number,
  extra?: Pick<CardObserveFailureDetail, 'httpStatus' | 'sanitizedMessage'>,
): never {
  throw new CardObserveStopped(reason, {
    endpoint: ACCOUNT_ENDPOINT,
    elapsedMs: Math.max(0, Date.now() - started),
    ...extra,
  });
}

function divergencesOf(
  purchase: CardObservePurchase,
  storedOrderId: string,
  order: CardVerifiedOrder,
): string[] {
  const found: string[] = [];
  if (order.orderId !== storedOrderId) found.push('order_id');
  const expected = asMoney(purchase.amountPaid);
  if (order.amountBrl != null && Math.abs(order.amountBrl - expected) > 0.009) {
    found.push('amount');
  }
  if (order.currency !== 'BRL') found.push('currency');
  const reference = order.externalReference;
  if (
    !reference ||
    (reference !== purchase.id &&
      reference !== sanitizeCardExternalReference(purchase.id))
  ) {
    found.push('external_reference');
  }
  if (order.installments != null && order.installments !== 1) found.push('installments');
  if (order.paymentType && order.paymentType !== 'credit_card') found.push('payment_type');
  return found;
}

function hypotheticalOf(input: {
  eligible: boolean;
  transport: CardObserveReport['transport'];
  settlement: 'none' | 'review' | 'partial' | 'full';
  refundAction: CardObserveReport['refundAction'];
  credits: number;
  balance: number | null;
}): CardObserveReport['hypothetical'] {
  const debit =
    input.eligible && input.settlement === 'full' && !input.transport ? input.credits : 0;
  const available = input.balance ?? 0;
  const projectedDebit = Math.min(Math.max(available, 0), debit);
  const projectedShortfall = debit - projectedDebit;
  if (!input.eligible) {
    return {
      settlement: 'none',
      label: 'Fora da seleção',
      wouldChangeStatus: false,
      wouldWriteAudit: false,
      wouldDebitCredits: false,
      projectedDebit: 0,
      projectedShortfall: 0,
    };
  }
  if (input.transport || input.settlement === 'none') {
    const label = input.refundAction === 'confirm' && !input.transport ? 'Manter PAID' : 'Não liquidar';
    return {
      settlement: 'none',
      label,
      wouldChangeStatus: false,
      wouldWriteAudit: false,
      wouldDebitCredits: false,
      projectedDebit: 0,
      projectedShortfall: 0,
    };
  }
  if (input.settlement === 'review') {
    return {
      settlement: 'review',
      label: 'Registrar revisão',
      wouldChangeStatus: false,
      wouldWriteAudit: true,
      wouldDebitCredits: false,
      projectedDebit: 0,
      projectedShortfall: 0,
    };
  }
  if (input.settlement === 'partial') {
    return {
      settlement: 'partial',
      label: 'Registrar parcial',
      wouldChangeStatus: false,
      wouldWriteAudit: true,
      wouldDebitCredits: false,
      projectedDebit: 0,
      projectedShortfall: 0,
    };
  }
  return {
    settlement: 'full',
    label: 'Marcar REFUNDED e recuperar créditos',
    wouldChangeStatus: true,
    wouldWriteAudit: projectedShortfall > 0,
    wouldDebitCredits: true,
    projectedDebit,
    projectedShortfall,
  };
}

function emptyFinancial(
  purchase: CardObservePurchase,
  orderId: string,
  eligible: boolean,
  lock: CardObserveLock | null,
  transport: CardObserveReport['transport'],
): CardObserveReport {
  return {
    ok: false,
    purchaseId: purchase.id,
    eligible,
    purchase: {
      status: purchase.status,
      amountPaid: purchase.amountPaid,
      currency: purchase.currency,
      credits: purchase.credits,
      provider: purchase.provider,
      orderId,
      venueName: purchase.venueName,
      balance: purchase.balance,
      walletUpdatedAt: purchase.walletUpdatedAt?.toISOString() ?? null,
      updatedAt: purchase.updatedAt.toISOString(),
      auditCount: purchase.auditCount,
    },
    account: null,
    lock: lock
      ? {
          held: lock.held,
          cursorPurchaseId: lock.cursorPurchaseId,
          cooldownUntil: lock.cooldownUntil?.toISOString() ?? null,
          lockedUntil: lock.lockedUntil.toISOString(),
        }
      : null,
    transport,
    order: null,
    payment: null,
    refunds: [],
    processedRefundBrl: null,
    assessment: null,
    refundAction: null,
    matchesPurchase: null,
    divergences: [],
    hypothetical: hypotheticalOf({
      eligible,
      transport,
      settlement: 'none',
      refundAction: null,
      credits: purchase.credits,
      balance: purchase.balance,
    }),
  };
}

export async function observeCardReconciliation(input: {
  purchaseId: string;
  now?: Date;
  env: CardObserveEnv;
  db: CardObserveDb;
  http: CardObserveHttp;
}): Promise<CardObserveReport> {
  const purchaseId = input.purchaseId.trim();
  if (!purchaseId || purchaseId === 'all' || purchaseId.includes('*')) {
    throw new CardObserveStopped('compra_invalida');
  }
  if (input.env.reconcileEnabled) throw new CardObserveStopped('reconcilacao_ligada');
  if (input.env.production) throw new CardObserveStopped('producao');
  if (!input.env.sandbox) throw new CardObserveStopped('sandbox_inativo');
  if (!tokenAccepted(input.env.accessToken)) throw new CardObserveStopped('token_invalido');
  assertObserveDatabaseUrl(input.env.databaseUrl);

  const server = await input.db.server();
  if (server.name !== 'after' || !localServer(server.addr, server.port)) {
    throw new CardObserveStopped('banco_recusado');
  }

  const purchase = await input.db.purchase(purchaseId);
  if (!purchase || purchase.id !== purchaseId) throw new CardObserveStopped('compra_ausente');
  if (purchase.provider !== 'card') throw new CardObserveStopped('provedor_invalido');
  const orderId = cardOrderIdFromProviderTxId(purchase.providerTxId);
  if (!orderId) throw new CardObserveStopped('ordem_ausente');
  const lock = await input.db.lock();
  const now = input.now ?? new Date();
  const eligible =
    purchase.status === 'PAID' &&
    purchase.confirmedAt instanceof Date &&
    purchase.confirmedAt.getTime() < now.getTime() - CARD_PAID_RECONCILE_MIN_AGE_MS;

  const token = input.env.accessToken?.trim() ?? '';
  const accountStarted = Date.now();
  let me: CardObserveHttpResult;
  try {
    me = await input.http.getCurrentUser(token, CARD_RECONCILE_GET_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof CardObserveStopped) throw error;
    const transport =
      error instanceof MercadoPagoNetworkError
        ? error.transport
        : classifyMercadoPagoNetworkFailure(error);
    stopAccount(accountTransportReason(transport), accountStarted, {
      sanitizedMessage: clippedErrorMessage(error),
    });
  }
  if (me.status < 200 || me.status >= 300) {
    stopAccount(accountHttpReason(me.status), accountStarted, { httpStatus: me.status });
  }
  const account = accountOf(me.data);
  if (account.kind === 'invalid') {
    stopAccount('account_invalid_response', accountStarted, { httpStatus: me.status });
  }
  if (!account.testUser || account.id !== CARD_OBSERVE_EXPECTED_SELLER_ID) {
    throw new CardObserveStopped('conta_nao_teste');
  }
  const sellerId = CARD_OBSERVE_EXPECTED_SELLER_ID;

  let result: CardObserveHttpResult;
  try {
    result = await input.http.getOrder(token, orderId, CARD_RECONCILE_GET_TIMEOUT_MS);
  } catch (error) {
    const transport = error instanceof MercadoPagoTimeoutError ? 'timeout' : 'retry';
    const report = emptyFinancial(purchase, orderId, eligible, lock, transport);
    report.account = { sellerId, testUser: true };
    return report;
  }

  if (result.status === 429) {
    const report = emptyFinancial(purchase, orderId, eligible, lock, 'rate_limit');
    report.account = { sellerId, testUser: true };
    return report;
  }
  if (result.status >= 500) {
    const report = emptyFinancial(purchase, orderId, eligible, lock, 'unavailable');
    report.account = { sellerId, testUser: true };
    return report;
  }
  if (result.status < 200 || result.status >= 300) {
    const report = emptyFinancial(purchase, orderId, eligible, lock, 'retry');
    report.account = { sellerId, testUser: true };
    return report;
  }

  const envelope = readMercadoPagoOrderEnvelope(result.data);
  const verified = parseCardOrder(envelope.order ?? result.data);
  const raw = (envelope.order ?? result.data ?? {}) as Parameters<typeof describeCardRefunds>[0];
  if (!verified) {
    const report = emptyFinancial(purchase, orderId, eligible, lock, 'retry');
    report.account = { sellerId, testUser: true };
    return report;
  }

  const described = describeCardRefunds(raw);
  const refundAction = cardRefundAction(verified);
  const settlement = eligible
    ? decidePaidCardReconcileAction(orderId, purchase, verified)
    : 'none';
  const found = divergencesOf(purchase, orderId, verified);
  return {
    ok: true,
    purchaseId: purchase.id,
    eligible,
    purchase: {
      status: purchase.status,
      amountPaid: purchase.amountPaid,
      currency: purchase.currency,
      credits: purchase.credits,
      provider: purchase.provider,
      orderId,
      venueName: purchase.venueName,
      balance: purchase.balance,
      walletUpdatedAt: purchase.walletUpdatedAt?.toISOString() ?? null,
      updatedAt: purchase.updatedAt.toISOString(),
      auditCount: purchase.auditCount,
    },
    account: { sellerId, testUser: true },
    lock: lock
      ? {
          held: lock.held,
          cursorPurchaseId: lock.cursorPurchaseId,
          cooldownUntil: lock.cooldownUntil?.toISOString() ?? null,
          lockedUntil: lock.lockedUntil.toISOString(),
        }
      : null,
    transport: null,
    order: {
      id: verified.orderId,
      status: described.orderStatus,
      statusDetail: described.orderStatusDetail,
      externalReference: described.externalReference,
      currency: described.currency,
      totalAmount: described.totalAmount,
    },
    payment: {
      id: described.paymentId,
      status: described.paymentStatus,
      statusDetail: described.paymentStatusDetail,
      type: described.paymentType,
    },
    refunds: described.refunds,
    processedRefundBrl:
      described.processedCents == null ? null : described.processedCents / 100,
    assessment: {
      refundScope: verified.refundScope ?? 'none',
      refundedAmountBrl: verified.refundedAmountBrl ?? null,
      refundId: verified.refundId ?? null,
    },
    refundAction,
    matchesPurchase: found.length === 0,
    divergences: found,
    hypothetical: hypotheticalOf({
      eligible,
      transport: null,
      settlement,
      refundAction,
      credits: purchase.credits,
      balance: purchase.balance,
    }),
  };
}

export function prismaCardObserveDb(prisma: PrismaClient): CardObserveDb {
  return {
    async server() {
      const rows = await prisma.$queryRaw<
        Array<{ name: string; addr: string | null; port: number }>
      >`
        SELECT current_database() AS name,
               inet_server_addr()::text AS addr,
               inet_server_port() AS port
      `;
      const row = rows[0];
      if (!row) throw new CardObserveStopped('banco_recusado');
      return { name: row.name, addr: row.addr, port: Number(row.port) };
    },
    async purchase(id: string) {
      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          status: string;
          amountPaid: string;
          currency: string;
          credits: number;
          provider: string | null;
          providerTxId: string | null;
          confirmedAt: Date | null;
          updatedAt: Date;
          venueName: string;
          balance: number | null;
          walletUpdatedAt: Date | null;
          auditCount: number;
        }>
      >`
        SELECT p.id,
               p.status,
               p."amountPaid"::text AS "amountPaid",
               p.currency,
               p.credits,
               p.provider,
               p."providerTxId",
               p."confirmedAt",
               p."updatedAt",
               v.name AS "venueName",
               w.balance,
               w."updatedAt" AS "walletUpdatedAt",
               (SELECT COUNT(*)::int FROM "CreditRefundAudit" a WHERE a."purchaseId" = p.id) AS "auditCount"
        FROM "CreditPurchase" p
        JOIN "Venue" v ON v.id = p."venueId"
        LEFT JOIN "CreditWallet" w ON w."venueId" = v.id
        WHERE p.id = ${id}
      `;
      const row = rows[0];
      if (!row) return null;
      return {
        ...row,
        credits: Number(row.credits),
        balance: row.balance == null ? null : Number(row.balance),
        auditCount: Number(row.auditCount),
      };
    },
    async lock() {
      const rows = await prisma.$queryRaw<
        Array<{
          held: boolean;
          cursorPurchaseId: string | null;
          cooldownUntil: Date | null;
          lockedUntil: Date;
        }>
      >`
        SELECT ("lockedUntil" > NOW()) AS held,
               "cursorPurchaseId",
               "cooldownUntil",
               "lockedUntil"
        FROM "CardReconcileLock"
        WHERE id = 1
      `;
      return rows[0] ?? null;
    },
  };
}
