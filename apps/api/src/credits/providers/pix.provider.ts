import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { isMercadoPagoSandbox, isProduction } from '../../common/env';
import { assertMercadoPagoPixChargeAllowed } from './mercado-pago-credentials';
import { asMoney } from '../purchase-public';
import { PaymentProvider, pixOrderIdFromProviderTxId } from './payment-provider';
import {
  AfterPurchaseStatus,
  MercadoPagoOrder,
  MercadoPagoOrdersClient,
  PIX_EXPIRATION_ISO8601,
  extractMercadoPagoOrderId,
  extractMercadoPagoSignatureDataId,
  firstOrderPayment,
  formatBrlAmount,
  formatMercadoPagoErrorLog,
  formatMercadoPagoWebhookSignatureLog,
  inspectMercadoPagoWebhookSignature,
  mapMercadoPagoOrderStatus,
  mercadoPagoPublicErrorMessage,
  parseBrlAmount,
  verifyMercadoPagoWebhookSignature,
} from './mercado-pago-orders';
import {
  diagnoseMercadoPagoWebhookHmac,
  formatMercadoPagoHmacDiagnosis,
  formatMercadoPagoRawHeaderObservation,
  type MercadoPagoRawHeaderObservation,
} from './mercado-pago-webhook-diagnose';

/** Payer overlay used only when MERCADO_PAGO_SANDBOX=true (never in production). */
export const MERCADO_PAGO_SANDBOX_PAYER = {
  email: 'test_user_br@testuser.com',
  firstName: 'APRO',
} as const;

export const PIX_INVALID_PAYER_EMAIL_MESSAGE =
  'E-mail do pagador ausente ou inválido no perfil. Atualize o cadastro com um e-mail real para pagar com PIX.';

/** IANA special-use / Mercado Pago-rejected TLDs. `.local` is the seed/demo domain. */
const RESERVED_PAYER_EMAIL_TLDS = new Set([
  'local',
  'test',
  'example',
  'invalid',
  'localhost',
]);

/**
 * Normalizes the authenticated payer e-mail for Mercado Pago production PIX.
 * Returns null when empty, malformed, `@testuser.com`, or a reserved TLD.
 */
export function normalizePixPayerEmail(value?: string | null): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email || email.length > 254) return null;
  const at = email.lastIndexOf('@');
  if (at < 1 || at !== email.indexOf('@')) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || local.length > 64) return null;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (!/^[a-z0-9._%+\-]+$/.test(local)) return null;
  if (
    !/^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)+$/.test(
      domain,
    )
  ) {
    return null;
  }
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (tld.length < 2 || RESERVED_PAYER_EMAIL_TLDS.has(tld)) return null;
  if (domain === 'testuser.com' || domain.endsWith('.testuser.com')) return null;
  return email;
}

export type PixCreateChargeInput = {
  purchaseId: string;
  packageKey: string;
  amountBrl: number;
  payerEmail?: string;
  payerName?: string;
  idempotencyKey: string;
};

export type PixChargeResult = {
  orderId: string;
  paymentId: string | null;
  qrCodeText: string | null;
  qrCodeImage: string | null;
  expiresAt: string | null;
};

export type PixWebhookMeta = {
  xSignature?: string;
  xRequestId?: string;
  query?: Record<string, unknown>;
  /** Sanitized wire-header comparison. Not an input to the HMAC. */
  headerObservation?: MercadoPagoRawHeaderObservation;
};

/** full: status or detail names a complete refund. partial: partially_refunded. unproven: another refund word without that proof. */
export type PixRefundProof = 'none' | 'full' | 'partial' | 'unproven';

/**
 * One marker per purchase. It is the first proven partial observation, not a
 * history of later partials. The unique key is `(purchaseId, kind)`.
 */
export const PIX_PARTIAL_REVIEW_KIND = 'pix_partial_review';

export type PixProvenPartial = {
  refundedAmountBrl: number;
  refundId: string | null;
};

export type PixVerifiedOrder = {
  orderId: string;
  paymentId: string | null;
  status: AfterPurchaseStatus;
  amountBrl: number | null;
  currency: string | null;
  externalReference: string | null;
  expiresAt: string | null;
  paymentMethodId?: string | null;
  paymentType?: string | null;
  /**
   * Absent only on older fixtures. A missing value is not partial and is not
   * unproven; settlement still requires identity, BRL, and the purchase amount.
   */
  refundProof?: PixRefundProof;
  /** Processed refund lines that prove a partial. The charge total is `amountBrl`. */
  provenPartialRefund?: PixProvenPartial | null;
};

@Injectable()
export class PixPaymentProvider implements PaymentProvider {
  readonly id = 'pix' as const;
  private readonly logger = new Logger(PixPaymentProvider.name);

  constructor(private readonly mp: MercadoPagoOrdersClient = new MercadoPagoOrdersClient()) {}

  get isConfigured(): boolean {
    return Boolean(this.accessToken());
  }

  async createCharge(input: PixCreateChargeInput): Promise<PixChargeResult> {
    assertMercadoPagoPixChargeAllowed();
    const token = this.requireToken();
    const payer = this.resolvePayer(input);

    const amount = formatBrlAmount(input.amountBrl);
    const body = {
      type: 'online',
      processing_mode: 'automatic',
      total_amount: amount,
      external_reference: sanitizeExternalReference(input.purchaseId),
      description: `AFTER créditos ${input.packageKey}`,
      payer,
      transactions: {
        payments: [
          {
            amount,
            payment_method: {
              id: 'pix',
              type: 'bank_transfer',
            },
            expiration_time: PIX_EXPIRATION_ISO8601,
          },
        ],
      },
    };

    const result = await this.mp.createOrder(token, input.idempotencyKey, body);
    if (result.status < 200 || result.status >= 300) {
      this.logger.error(
        `Mercado Pago create order failed (${result.status}) ${formatMercadoPagoErrorLog(result.data)}`,
      );
      throw new ServiceUnavailableException(
        mercadoPagoPublicErrorMessage(
          result.data,
          'Não foi possível criar o PIX. Tente novamente.',
        ),
      );
    }

    const order = (result.data ?? {}) as MercadoPagoOrder;
    const payment = firstOrderPayment(order);
    const orderId = String(order.id ?? '').trim();
    if (!orderId) {
      throw new ServiceUnavailableException(
        'Não foi possível criar o PIX. Tente novamente.',
      );
    }

    const qrCodeText = payment?.payment_method?.qr_code?.trim() || null;
    const qrCodeImage = toQrImage(payment?.payment_method?.qr_code_base64);
    if (!qrCodeText && !qrCodeImage) {
      throw new ServiceUnavailableException(
        'O Mercado Pago não retornou o QR Code do PIX. Tente novamente.',
      );
    }

    return {
      orderId,
      paymentId: payment?.id?.trim() || orderId,
      qrCodeText,
      qrCodeImage,
      expiresAt: payment?.date_of_expiration?.trim() || null,
    };
  }

  async getOrder(orderId: string): Promise<PixVerifiedOrder> {
    const token = this.requireToken();
    const id = orderId.trim();
    if (!id) {
      throw new BadRequestException('Identificador de transação inválido');
    }

    const result = await this.mp.getOrder(token, id);
    if (result.status < 200 || result.status >= 300) {
      this.logger.error(
        `Mercado Pago get order failed (${result.status}) ${formatMercadoPagoErrorLog(result.data)}`,
      );
      throw new ServiceUnavailableException(
        mercadoPagoPublicErrorMessage(
          result.data,
          'Não foi possível confirmar o pagamento PIX.',
        ),
      );
    }

    const order = (result.data ?? {}) as MercadoPagoOrder;
    const payment = firstOrderPayment(order);
    const resolvedId = String(order.id ?? id).trim();
    const rawStatus = order.status ?? payment?.status;
    const rawDetail = order.status_detail ?? payment?.status_detail;
    return {
      orderId: resolvedId,
      paymentId: payment?.id?.trim() || null,
      status: mapMercadoPagoOrderStatus(rawStatus, rawDetail),
      amountBrl: parseBrlAmount(order.total_amount ?? payment?.amount),
      currency: readPixCurrency(order),
      externalReference: order.external_reference?.trim() || null,
      expiresAt: payment?.date_of_expiration?.trim() || null,
      paymentMethodId: payment?.payment_method?.id?.trim().toLowerCase() || null,
      paymentType: payment?.payment_method?.type?.trim().toLowerCase() || null,
      refundProof: pixRefundProof(rawStatus, rawDetail),
      provenPartialRefund: provenPixPartialRefund(order, payment),
    };
  }

  assertWebhookSignature(meta: PixWebhookMeta, payload?: unknown): void {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
    if (!secret) {
      if (isProduction()) {
        throw new UnauthorizedException('Webhook PIX não configurado');
      }
      this.logger.warn(
        'MERCADO_PAGO_WEBHOOK_SECRET ausente — validação HMAC ignorada fora de produção.',
      );
      return;
    }

    const diagnostic = inspectMercadoPagoWebhookSignature({
      payload,
      query: meta.query,
      xSignature: meta.xSignature,
      xRequestId: meta.xRequestId,
    });
    const ok = verifyMercadoPagoWebhookSignature({
      secret,
      xSignature: meta.xSignature,
      xRequestId: meta.xRequestId,
      dataId: extractMercadoPagoSignatureDataId(meta.query) ?? undefined,
    });
    const line = formatMercadoPagoWebhookSignatureLog(
      ok ? 'accepted' : 'rejected',
      diagnostic,
    );
    const rawLine =
      process.env.AFTER_CARD_TEST === '1' && meta.headerObservation
        ? formatMercadoPagoRawHeaderObservation(meta.headerObservation)
        : null;
    if (!ok) {
      this.logger.warn(line);
      if (process.env.AFTER_CARD_TEST === '1') {
        try {
          this.logger.warn(
            formatMercadoPagoHmacDiagnosis(
              diagnoseMercadoPagoWebhookHmac({
                secret,
                dataId: extractMercadoPagoSignatureDataId(meta.query) ?? undefined,
                xRequestId: meta.xRequestId,
                xSignature: meta.xSignature,
              }),
            ),
          );
        } catch {
          this.logger.warn('Mercado Pago webhook hmac diagnose local unavailable');
        }
        if (rawLine) this.logger.warn(rawLine);
      }
      throw new UnauthorizedException('Assinatura do webhook inválida');
    }
    this.logger.log(line);
    if (rawLine) this.logger.log(rawLine);
  }

  extractOrderId(
    payload: unknown,
    query?: Record<string, unknown>,
  ): string | null {
    return extractMercadoPagoOrderId(payload, query);
  }

  verify(_input: unknown): never {
    throw new BadRequestException('PIX não usa verificação de loja');
  }

  private resolvePayer(input: PixCreateChargeInput): {
    email: string;
    first_name?: string;
    last_name?: string;
  } {
    if (isMercadoPagoSandbox()) {
      return {
        email: MERCADO_PAGO_SANDBOX_PAYER.email,
        first_name: MERCADO_PAGO_SANDBOX_PAYER.firstName,
      };
    }
    const email = normalizePixPayerEmail(input.payerEmail);
    if (!email) {
      throw new BadRequestException(PIX_INVALID_PAYER_EMAIL_MESSAGE);
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

  private requireToken(): string {
    const token = this.accessToken();
    if (!token) {
      throw new ServiceUnavailableException(
        'PIX payment provider is not configured',
      );
    }
    return token;
  }
}

function toQrImage(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return raw;
  }
  return `data:image/png;base64,${raw}`;
}

function splitPersonName(name?: string): { first_name?: string; last_name?: string } {
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

function sanitizeExternalReference(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

export function pixReferenceMatchesPurchase(
  purchaseId: string,
  reference: string | null,
): boolean {
  const value = reference?.trim() ?? '';
  if (!value) return false;
  return value === purchaseId || value === sanitizeExternalReference(purchaseId);
}

/**
 * A PIX refund may change status only when the order is the stored order,
 * the reference is this purchase, the currency is BRL, and the amount is the
 * purchase amount. A partial or unproven signal does not settle.
 */
export function pixRefundMaySettle(
  purchase: { id: string; amountPaid: unknown; providerTxId?: string | null },
  order: PixVerifiedOrder,
): boolean {
  if (order.status !== 'REFUNDED') return false;
  if (order.refundProof === 'partial' || order.refundProof === 'unproven') return false;
  if (order.refundProof != null && order.refundProof !== 'full') return false;
  if (order.currency !== 'BRL') return false;
  const stored = pixOrderIdFromProviderTxId(purchase.providerTxId);
  if (!stored || stored !== order.orderId) return false;
  if (!pixReferenceMatchesPurchase(purchase.id, order.externalReference)) return false;
  if (order.amountBrl == null) return false;
  return Math.abs(order.amountBrl - asMoney(purchase.amountPaid)) <= 0.009;
}

/**
 * A partial may be marked only when the charge identity matches and a
 * processed refund line proves an amount below the charge. The status word
 * alone is not proof. `amountBrl` stays the charge total.
 */
export function pixPartialMarkerAllowed(
  purchase: {
    id: string;
    amountPaid: unknown;
    providerTxId?: string | null;
    provider?: string | null;
  },
  order: PixVerifiedOrder,
): boolean {
  if (purchase.provider != null && purchase.provider !== 'pix') return false;
  if (order.refundProof !== 'partial' || order.status !== 'REFUNDED') return false;
  if (order.currency !== 'BRL') return false;
  if (order.paymentMethodId != null && order.paymentMethodId !== 'pix') return false;
  if (order.paymentType != null && order.paymentType !== 'bank_transfer') return false;
  const stored = pixOrderIdFromProviderTxId(purchase.providerTxId);
  if (!stored || stored !== order.orderId) return false;
  if (!pixReferenceMatchesPurchase(purchase.id, order.externalReference)) return false;
  if (order.amountBrl == null) return false;
  const charge = asMoney(purchase.amountPaid);
  if (Math.abs(order.amountBrl - charge) > 0.009) return false;
  const proven = order.provenPartialRefund;
  if (!proven || proven.refundedAmountBrl == null) return false;
  if (!(proven.refundedAmountBrl > 0) || proven.refundedAmountBrl >= charge - 0.009) {
    return false;
  }
  return true;
}

function readPixCurrency(order: MercadoPagoOrder): string | null {
  const modern = text(order.currency).toUpperCase();
  const legacy = text(order.currency_id).toUpperCase();
  if (modern && legacy && modern !== legacy) return null;
  return modern || legacy || null;
}

function pixRefundProof(status?: string | null, detail?: string | null): PixRefundProof {
  const normalized = text(status).toLowerCase();
  const statusDetail = text(detail).toLowerCase();
  if (
    statusDetail === 'partially_refunded' ||
    statusDetail.includes('partially_refunded')
  ) {
    return 'partial';
  }
  if (normalized === 'refunded' || normalized === 'charged_back') return 'full';
  if (statusDetail === 'refunded' || statusDetail.includes('refunded')) return 'full';
  if (normalized === 'processed' && statusDetail.includes('refund')) return 'unproven';
  return 'none';
}

function provenPixPartialRefund(
  order: MercadoPagoOrder,
  payment: ReturnType<typeof firstOrderPayment>,
): PixProvenPartial | null {
  const rawStatus = order.status ?? payment?.status;
  const rawDetail = order.status_detail ?? payment?.status_detail;
  if (pixRefundProof(rawStatus, rawDetail) !== 'partial') return null;
  const paid = pixChargeCents(order, payment);
  const counted = pixProcessedRefundCents(order, payment);
  if (paid == null || !counted.ok) return null;
  if (counted.cents <= 0 || counted.cents >= paid) return null;
  return {
    refundedAmountBrl: counted.cents / 100,
    refundId: counted.refundId,
  };
}

function pixChargeCents(
  order: MercadoPagoOrder,
  payment: ReturnType<typeof firstOrderPayment>,
): number | null {
  const total = pixCents(order.total_amount);
  const paymentAmount = pixCents(payment?.amount);
  if (total == null || paymentAmount == null || total !== paymentAmount) return null;
  return total;
}

function pixProcessedRefundCents(
  order: MercadoPagoOrder,
  payment: ReturnType<typeof firstOrderPayment>,
): { ok: true; cents: number; refundId: string | null } | { ok: false } {
  const refunds = order.transactions?.refunds;
  const list = Array.isArray(refunds) ? refunds : refunds ? [refunds] : [];
  const paymentId = text(payment?.id);
  const byId = new Map<string, number>();
  for (const refund of list) {
    if (text(refund.status).toLowerCase() !== 'processed') continue;
    const id = text(refund.id);
    const transactionId = text(refund.transaction_id);
    if (!id || !paymentId || !transactionId) return { ok: false };
    if (transactionId !== paymentId) continue;
    const cents = pixCents(refund.amount ?? refund.transaction_amount);
    if (cents == null || cents <= 0) return { ok: false };
    const previous = byId.get(id);
    if (previous != null && previous !== cents) return { ok: false };
    byId.set(id, cents);
  }
  if (byId.size === 0) return { ok: false };
  let cents = 0;
  for (const value of byId.values()) cents += value;
  const ids = [...byId.keys()];
  return { ok: true, cents, refundId: ids.length === 1 ? ids[0] : null };
}

function pixCents(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const rendered = value.toFixed(2);
    if (Math.abs(value - Number(rendered)) > 1e-6) return null;
    return pixCents(rendered);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
