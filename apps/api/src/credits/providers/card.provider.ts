import { createHash } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isMercadoPagoSandbox } from '../../common/env';
import { assertMercadoPagoCardChargeAllowed } from './mercado-pago-credentials';
import { PaymentProvider, cardOrderIdFromProviderTxId } from './payment-provider';
import { asMoney } from '../purchase-public';
import {
  AfterPurchaseStatus,
  MercadoPagoOrder,
  MercadoPagoOrdersClient,
  MercadoPagoTimeoutError,
  firstOrderPayment,
  formatBrlAmount,
  isUnequivocalCardDecline,
  mapMercadoPagoOrderStatus,
  parseBrlAmount,
  readMercadoPagoOrderEnvelope,
} from './mercado-pago-orders';

/** Card Payment Brick stays at 1x until a later phase decides who pays interest. */
export const CARD_MAX_INSTALLMENTS = 1;

/**
 * Soft descriptor for After Web card charges.
 * Mercado Pago prefixes the card statement with "MP *"; that prefix is not sent.
 * Brazil Orders API field: transactions.payments[].payment_method.statement_descriptor.
 */
export const CARD_STATEMENT_DESCRIPTOR = 'CREDITOAFTER';

export const CARD_INVALID_PAYER_EMAIL_MESSAGE =
  'E-mail do pagador ausente ou inválido no perfil. Atualize o cadastro com um e-mail real para pagar com cartão.';

/** Orders card tests accept only this buyer email. It is not the PIX sandbox payer. */
export const CARD_SANDBOX_PAYER_EMAIL = 'test@testuser.com';

const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{20,256}$/;
const OPERATION_KEY = /^[A-Za-z0-9_-]{16,64}$/;
const PAYMENT_METHOD_ID = /^[a-z0-9_]{2,32}$/;

export type CardChargeInput = {
  purchaseId: string;
  packageKey: string;
  amountBrl: number;
  token: string;
  paymentMethodId: string;
  paymentType: string;
  installments: number;
  payerEmail?: string;
  payerName?: string;
  /** Stable across retries of the same purchase. Sent as X-Idempotency-Key. */
  idempotencyKey: string;
};

export type CardVerifiedOrder = {
  orderId: string;
  paymentId: string | null;
  status: AfterPurchaseStatus;
  amountBrl: number | null;
  currency: string;
  externalReference: string | null;
  installments: number | null;
  paymentType: string | null;
  paymentMethodId: string | null;
  /**
   * none: no refund signal. partial: proven partial, purchase stays PAID.
   * full: proven refund that covers the paid amount. review: signal without proof.
   */
  refundScope?: 'none' | 'partial' | 'full' | 'review';
  /** Present only when every refund entry in the order has an amount. */
  refundedAmountBrl?: number | null;
  /** Present only when the order contains exactly one refund id. */
  refundId?: string | null;
};

export type CardChargeResult =
  | { kind: 'order'; order: CardVerifiedOrder; confirmWithGet?: boolean }
  | { kind: 'rejected' }
  | { kind: 'unknown' };

export function cardOperationPurchaseId(
  venueId: string,
  idempotencyKey: string,
): string {
  const digest = createHash('sha256')
    .update(`card:${venueId}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 32);
  return `cp${digest}`;
}

export function cardTokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/** In-flight key. Not a Mercado Pago Order id. */
export function cardOperationProviderTxId(
  purchaseId: string,
  tokenFingerprint: string,
): string {
  return `card:op:${purchaseId}:${tokenFingerprint}`;
}

export function assertCardIdempotencyKey(value: string): void {
  if (!OPERATION_KEY.test(value)) {
    throw new BadRequestException('Identificador da operação inválido.');
  }
}

/**
 * Accepts only the opaque Mercado Pago card token.
 * Rejects a PAN, a spaced number, or an all-digit string.
 */
export function assertOpaqueCardToken(token: string): void {
  const compact = token.replace(/[\s-]/g, '');
  if (compact !== token || /^\d{13,19}$/.test(compact) || /^\d+$/.test(token)) {
    throw new BadRequestException('Envie apenas o token opaco do cartão.');
  }
  if (!OPAQUE_TOKEN.test(token)) {
    throw new BadRequestException('Token de cartão inválido.');
  }
}

export function assertCardPaymentMethod(paymentMethodId: string): string {
  const id = paymentMethodId.trim().toLowerCase();
  if (!PAYMENT_METHOD_ID.test(id) || id === 'pix') {
    throw new BadRequestException('Meio de pagamento inválido.');
  }
  return id;
}

export function sanitizeCardExternalReference(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

/** Same acceptance the webhook uses before confirming or refunding a card order. */
export function cardOrderMatchesPurchase(
  purchase: { id: string; amountPaid: unknown },
  order: CardVerifiedOrder,
): boolean {
  const expected = asMoney(purchase.amountPaid);
  if (order.amountBrl != null && Math.abs(order.amountBrl - expected) > 0.009) {
    return false;
  }
  if (order.currency !== 'BRL') return false;
  const reference = order.externalReference;
  if (
    !reference ||
    (reference !== purchase.id &&
      reference !== sanitizeCardExternalReference(purchase.id))
  ) {
    return false;
  }
  if (cardOrderIdFromProviderTxId(`card:${order.orderId}`) !== order.orderId) {
    return false;
  }
  if (order.installments != null && order.installments !== CARD_MAX_INSTALLMENTS) {
    return false;
  }
  if (order.paymentType && order.paymentType !== 'credit_card') return false;
  return true;
}

export type CardGetOrderOptions = {
  /** Set only by paid-card reconciliation. Other callers keep the unbounded GET. */
  timeoutMs?: number;
};

export class CardReconcileRateLimitError extends Error {
  readonly kind = 'rate_limit' as const;
  constructor(readonly retryAfterHeader: string | null) {
    super('rate_limit');
    this.name = 'CardReconcileRateLimitError';
  }
}

export class CardReconcileTransportError extends Error {
  constructor(readonly kind: 'timeout' | 'unavailable') {
    super(kind);
    this.name = 'CardReconcileTransportError';
  }
}

@Injectable()
export class CardPaymentProvider implements PaymentProvider {
  readonly id = 'card' as const;
  private readonly logger = new Logger(CardPaymentProvider.name);

  constructor(
    private readonly mp: MercadoPagoOrdersClient = new MercadoPagoOrdersClient(),
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.accessToken());
  }

  get publicKey(): string | null {
    const key = process.env.MERCADO_PAGO_PUBLIC_KEY?.trim();
    return key || null;
  }

  async createCharge(input: CardChargeInput): Promise<CardChargeResult> {
    assertMercadoPagoCardChargeAllowed();
    const token = this.requireAccessToken();
    this.assertChargeShape(input);
    const payer = this.resolvePayer(input);
    const amount = formatBrlAmount(input.amountBrl);
    const body = {
      type: 'online',
      processing_mode: 'automatic',
      total_amount: amount,
      external_reference: sanitizeCardExternalReference(input.purchaseId),
      description: `AFTER créditos ${input.packageKey}`,
      payer,
      transactions: {
        payments: [
          {
            amount,
            payment_method: {
              id: input.paymentMethodId,
              type: 'credit_card',
              token: input.token,
              installments: CARD_MAX_INSTALLMENTS,
              statement_descriptor: CARD_STATEMENT_DESCRIPTOR,
            },
          },
        ],
      },
    };

    let result: { status: number; data: unknown };
    try {
      result = await this.mp.createOrder(token, input.idempotencyKey, body);
    } catch (error) {
      this.logFailure('unreachable', error, input.token);
      return { kind: 'unknown' };
    }

    return this.classify(result.status, result.data, input.token, input.purchaseId);
  }

  async getOrder(
    orderId: string,
    options?: CardGetOrderOptions,
  ): Promise<CardVerifiedOrder> {
    const token = this.requireAccessToken();
    const id = orderId.trim();
    if (!id) {
      throw new BadRequestException('Identificador de transação inválido');
    }

    const reconcileGet = options?.timeoutMs != null;
    let result: { status: number; data: unknown; retryAfter?: string | null };
    try {
      result = await this.mp.getOrder(
        token,
        id,
        reconcileGet ? { timeoutMs: options.timeoutMs } : undefined,
      );
    } catch (error) {
      this.logFailure('get-order-unreachable', error, '');
      if (reconcileGet && error instanceof MercadoPagoTimeoutError) {
        throw new CardReconcileTransportError('timeout');
      }
      throw new ServiceUnavailableException(
        'Não foi possível confirmar o pagamento com cartão.',
      );
    }

    if (result.status < 200 || result.status >= 300) {
      this.logFailure(`get-order-${result.status}`, result.data, '');
      if (reconcileGet && result.status === 429) {
        throw new CardReconcileRateLimitError(result.retryAfter ?? null);
      }
      if (reconcileGet && result.status >= 500) {
        throw new CardReconcileTransportError('unavailable');
      }
      throw new ServiceUnavailableException(
        'Não foi possível confirmar o pagamento com cartão.',
      );
    }

    const order = parseCardOrder(
      readMercadoPagoOrderEnvelope(result.data).order ?? result.data,
    );
    if (!order) {
      throw new ServiceUnavailableException(
        'Não foi possível confirmar o pagamento com cartão.',
      );
    }
    return order;
  }

  private classify(
    status: number,
    data: unknown,
    cardToken: string,
    purchaseId: string,
  ): CardChargeResult {
    const envelope = readMercadoPagoOrderEnvelope(data);
    const order = parseCardOrder(envelope.order ?? data);
    const success = status >= 200 && status < 300;
    if (!success || !order) {
      this.logFailure(`create-${status}`, data, cardToken, purchaseId, envelope);
    }

    if (isTransientHttpStatus(status)) {
      return { kind: 'unknown' };
    }

    if (order && success) {
      return { kind: 'order', order };
    }

    if (order) {
      return { kind: 'order', order, confirmWithGet: true };
    }

    if (success) {
      return { kind: 'unknown' };
    }

    if (isUnequivocalCardDecline(envelope)) {
      return { kind: 'rejected' };
    }

    return { kind: 'unknown' };
  }

  private assertChargeShape(input: CardChargeInput): void {
    assertOpaqueCardToken(input.token);
    if (input.paymentType !== 'credit_card' || input.installments !== 1) {
      throw new BadRequestException(
        'Somente cartão de crédito à vista é aceito.',
      );
    }
    if (!input.idempotencyKey.trim()) {
      throw new BadRequestException('Identificador da operação inválido.');
    }
  }

  private resolvePayer(input: CardChargeInput): {
    email: string;
    first_name?: string;
    last_name?: string;
  } {
    if (isMercadoPagoSandbox()) {
      return {
        email: CARD_SANDBOX_PAYER_EMAIL,
        ...splitPersonName(input.payerName),
      };
    }
    const email = input.payerEmail?.trim();
    if (!email) {
      throw new BadRequestException(CARD_INVALID_PAYER_EMAIL_MESSAGE);
    }
    return {
      email,
      ...splitPersonName(input.payerName),
    };
  }

  private accessToken(): string | undefined {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    return token || undefined;
  }

  private requireAccessToken(): string {
    const token = this.accessToken();
    if (!token) {
      throw new ServiceUnavailableException(
        'Card payment provider is not configured',
      );
    }
    return token;
  }

  private logFailure(
    label: string,
    data: unknown,
    cardToken: string,
    purchaseId = 'ausente',
    envelope = data instanceof Error ? null : readMercadoPagoOrderEnvelope(data),
  ): void {
    const raw =
      data instanceof Error
        ? data.message
        : [
            `purchase ${purchaseId}`,
            `order ${envelope?.orderId ?? 'ausente'}`,
            `status ${envelope?.status ?? 'ausente'}`,
            `code ${envelope?.code ?? 'ausente'}`,
            `detail ${envelope?.detail ?? 'ausente'}`,
          ].join(' ');
    this.logger.error(
      `Mercado Pago card ${label} ${redactCardLog(redactSecret(raw, cardToken))}`,
    );
  }
}

export function parseCardOrder(data: unknown): CardVerifiedOrder | null {
  const order = (data ?? {}) as MercadoPagoOrder;
  const payment = firstOrderPayment(order);
  const orderId = String(order.id ?? '').trim();
  if (!orderId || /^\d+$/.test(orderId)) return null;
  const method = payment?.payment_method;
  return {
    orderId,
    paymentId: payment?.id?.trim() || null,
    status: mapMercadoPagoOrderStatus(
      order.status ?? payment?.status,
      order.status_detail ?? payment?.status_detail,
    ),
    amountBrl: parseBrlAmount(order.total_amount ?? payment?.amount),
    currency: readCurrency(order),
    externalReference: order.external_reference?.trim() || null,
    installments: readInstallments(method?.installments),
    paymentType: method?.type?.trim().toLowerCase() || null,
    paymentMethodId: method?.id?.trim().toLowerCase() || null,
    ...assessCardRefund(order),
  };
}

export type CardRefundScope = 'none' | 'partial' | 'full' | 'review';

export type CardRefundAssessment = {
  refundScope: CardRefundScope;
  refundedAmountBrl: number | null;
  refundId: string | null;
};

/** `currency` is the live Orders field. `currency_id` remains for older fixtures. */
export function readCardCurrency(order: MercadoPagoOrder): string | null {
  const modern = textValue(order.currency).toUpperCase();
  const legacy = textValue(order.currency_id).toUpperCase();
  if (modern && legacy && modern !== legacy) return null;
  return modern || legacy || null;
}

/**
 * Shared by webhook and reconciliation. The proven sum decides the scope.
 * `status_detail: refunded` alone never becomes a full debit: a smaller
 * processed sum is a partial, and a larger sum is review.
 */
export function assessCardRefund(order: MercadoPagoOrder): CardRefundAssessment {
  const payment = firstOrderPayment(order);
  const signal = combinedRefundSignal(order, payment);
  const empty: CardRefundAssessment = {
    refundScope: 'none',
    refundedAmountBrl: null,
    refundId: null,
  };
  if (signal === 'conflict') return { ...empty, refundScope: 'review' };

  const paid = paidAmountCents(order, payment);
  const counted = countProcessedRefunds(order, payment);
  if (!paid.ok || !counted.ok) {
    if (signal === 'none' && counted.ok) return empty;
    return { ...empty, refundScope: 'review' };
  }
  if (signal === 'none') {
    return counted.cents > 0 ? { ...empty, refundScope: 'review' } : empty;
  }
  if (counted.cents === 0 || counted.cents > paid.cents) {
    return { ...empty, refundScope: 'review' };
  }
  if (counted.cents < paid.cents) {
    if (isChargeback(order, payment)) return { ...empty, refundScope: 'review' };
    return {
      refundScope: 'partial',
      refundedAmountBrl: counted.cents / 100,
      refundId: counted.refundId,
    };
  }
  if (signal === 'full') {
    return {
      refundScope: 'full',
      refundedAmountBrl: counted.cents / 100,
      refundId: counted.refundId,
    };
  }
  return { ...empty, refundScope: 'review' };
}

/**
 * Same settlement choice for the webhook and paid-card reconciliation.
 * A partial or full debit requires the proven amount from `assessCardRefund`.
 * `reference_id` is not an input.
 */
export function cardRefundAction(order: {
  status: string;
  refundScope?: CardRefundScope;
  refundedAmountBrl?: number | null;
}): 'full' | 'partial' | 'review' | 'confirm' | 'terminal' | 'pending' {
  if (order.refundScope === 'review') return 'review';
  if (order.refundScope === 'partial') {
    return order.refundedAmountBrl == null ? 'review' : 'partial';
  }
  if (order.status === 'REFUNDED') {
    return order.refundScope === 'full' && order.refundedAmountBrl != null
      ? 'full'
      : 'review';
  }
  if (order.status === 'PAID') return 'confirm';
  if (order.status === 'FAILED' || order.status === 'CANCELLED') return 'terminal';
  return 'pending';
}

/**
 * The paid-card reconciliation decision, without lease, cursor, or settlement.
 * Review, partial, and full settle only when the stored order id and the
 * purchase match. A refund `reference_id` is not an identity check.
 * Confirm, terminal, and pending do not settle.
 */
export function decidePaidCardReconcileAction(
  storedOrderId: string,
  purchase: { id: string; amountPaid: unknown },
  order: CardVerifiedOrder,
): 'review' | 'partial' | 'full' | 'none' {
  const refundAction = cardRefundAction(order);
  if (refundAction !== 'review' && refundAction !== 'partial' && refundAction !== 'full') {
    return 'none';
  }
  if (order.orderId !== storedOrderId || !cardOrderMatchesPurchase(purchase, order)) {
    return 'none';
  }
  return refundAction;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function refundSignal(
  status?: string | null,
  statusDetail?: string | null,
): 'none' | 'partial' | 'full' {
  const normalizedStatus = textValue(status).toLowerCase();
  const detail = textValue(statusDetail).toLowerCase();
  if (detail === 'partially_refunded' || detail.includes('partially_refunded')) {
    return 'partial';
  }
  if (normalizedStatus === 'refunded' || normalizedStatus === 'charged_back') {
    return 'full';
  }
  if (detail === 'refunded' || detail.includes('refunded')) return 'full';
  return 'none';
}

function isChargeback(
  order: MercadoPagoOrder,
  payment: ReturnType<typeof firstOrderPayment>,
): boolean {
  return (
    textValue(order.status).toLowerCase() === 'charged_back' ||
    textValue(payment?.status).toLowerCase() === 'charged_back'
  );
}

function combinedRefundSignal(
  order: MercadoPagoOrder,
  payment: ReturnType<typeof firstOrderPayment>,
): 'none' | 'partial' | 'full' | 'conflict' {
  const orderSignal = refundSignal(order.status, order.status_detail);
  const paymentSignal = refundSignal(payment?.status, payment?.status_detail);
  if (orderSignal === paymentSignal) return orderSignal;
  if (orderSignal === 'none') return paymentSignal;
  if (paymentSignal === 'none') return orderSignal;
  return 'conflict';
}

function parseBrlCents(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const rendered = value.toFixed(2);
    if (Math.abs(value - Number(rendered)) > 1e-6) return null;
    return parseBrlCents(rendered);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

function paidAmountCents(
  order: MercadoPagoOrder,
  payment: ReturnType<typeof firstOrderPayment>,
): { ok: true; cents: number } | { ok: false } {
  const present = [order.total_amount, payment?.amount, payment?.paid_amount]
    .map((value) => (value == null || value === '' ? null : parseBrlCents(value)))
    .filter((value): value is number => value != null);
  if (
    [order.total_amount, payment?.amount, payment?.paid_amount].some(
      (value) => value != null && value !== '' && parseBrlCents(value) == null,
    )
  ) {
    return { ok: false };
  }
  if (present.length === 0) return { ok: false };
  if (present.some((value) => value !== present[0])) return { ok: false };
  return { ok: true, cents: present[0] };
}

/**
 * A processed refund belongs to this payment only when `transaction_id` is
 * that payment's id. `reference_id` is the refund operation's own metadata:
 * Mercado Pago does not set it equal to `payment.reference_id`.
 * A processed refund that cannot name its payment or its own id is not proof.
 * The same refund id is counted once; conflicting amounts for that id are not.
 */
function countProcessedRefunds(
  order: MercadoPagoOrder,
  payment: ReturnType<typeof firstOrderPayment>,
): { ok: true; cents: number; refundId: string | null } | { ok: false } {
  const refunds = order.transactions?.refunds;
  const list = Array.isArray(refunds) ? refunds : refunds ? [refunds] : [];
  const paymentId = textValue(payment?.id);
  const byId = new Map<string, number>();
  for (const refund of list) {
    if (textValue(refund.status).toLowerCase() !== 'processed') continue;
    const id = textValue(refund.id);
    const transactionId = textValue(refund.transaction_id);
    if (!id || !paymentId || !transactionId) return { ok: false };
    if (transactionId !== paymentId) continue;
    const cents = parseBrlCents(refund.amount ?? refund.transaction_amount);
    if (cents == null || cents <= 0) return { ok: false };
    const previous = byId.get(id);
    if (previous != null && previous !== cents) return { ok: false };
    byId.set(id, cents);
  }
  let cents = 0;
  for (const value of byId.values()) cents += value;
  const ids = [...byId.keys()];
  return { ok: true, cents, refundId: ids.length === 1 ? ids[0] : null };
}

export type CardRefundLineView = {
  id: string | null;
  status: string | null;
  amount: string | null;
  transactionId: string | null;
};

/** Raw refund lines plus the processed sum already computed by `countProcessedRefunds`. */
export function describeCardRefunds(order: MercadoPagoOrder): {
  orderStatus: string | null;
  orderStatusDetail: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  paymentStatusDetail: string | null;
  paymentType: string | null;
  currency: string | null;
  totalAmount: string | null;
  externalReference: string | null;
  refunds: CardRefundLineView[];
  processedCents: number | null;
} {
  const payment = firstOrderPayment(order);
  const counted = countProcessedRefunds(order, payment);
  const refundsRaw = order.transactions?.refunds;
  const list = Array.isArray(refundsRaw) ? refundsRaw : refundsRaw ? [refundsRaw] : [];
  return {
    orderStatus: textValue(order.status) || null,
    orderStatusDetail: textValue(order.status_detail) || null,
    paymentId: textValue(payment?.id) || null,
    paymentStatus: textValue(payment?.status) || null,
    paymentStatusDetail: textValue(payment?.status_detail) || null,
    paymentType: textValue(payment?.payment_method?.type).toLowerCase() || null,
    currency: readCardCurrency(order),
    totalAmount: textValue(order.total_amount) || null,
    externalReference: textValue(order.external_reference) || null,
    refunds: list.map((refund) => ({
      id: textValue(refund.id) || null,
      status: textValue(refund.status) || null,
      amount: textValue(refund.amount ?? refund.transaction_amount) || null,
      transactionId: textValue(refund.transaction_id) || null,
    })),
    processedCents: counted.ok ? counted.cents : null,
  };
}

function readCurrency(order: MercadoPagoOrder): string {
  return readCardCurrency(order) ?? '';
}

function readInstallments(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function isTransientHttpStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

function redactSecret(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join('[redacted]');
}

function redactCardLog(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/APP_USR-[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/TEST-[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[redacted]')
    .replace(/\b\d{13,19}\b/g, '[redacted]');
}

function splitPersonName(name?: string): {
  first_name?: string;
  last_name?: string;
} {
  const trimmed = name?.trim();
  if (!trimmed) return {};
  const space = trimmed.indexOf(' ');
  if (space === -1) return { first_name: trimmed };
  const first_name = trimmed.slice(0, space).trim();
  const last_name = trimmed.slice(space + 1).trim();
  return {
    ...(first_name ? { first_name } : {}),
    ...(last_name ? { last_name } : {}),
  };
}
