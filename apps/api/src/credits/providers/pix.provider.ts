import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { isMercadoPagoSandbox, isProduction } from '../../common/env';
import { PaymentProvider } from './payment-provider';
import {
  AfterPurchaseStatus,
  MercadoPagoOrder,
  MercadoPagoOrdersClient,
  PIX_EXPIRATION_ISO8601,
  extractMercadoPagoDataId,
  extractMercadoPagoOrderId,
  firstOrderPayment,
  formatBrlAmount,
  formatMercadoPagoErrorLog,
  mapMercadoPagoOrderStatus,
  mercadoPagoPublicErrorMessage,
  parseBrlAmount,
  verifyMercadoPagoWebhookSignature,
} from './mercado-pago-orders';

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
};

export type PixVerifiedOrder = {
  orderId: string;
  paymentId: string | null;
  status: AfterPurchaseStatus;
  amountBrl: number | null;
  currency: 'BRL';
  externalReference: string | null;
  expiresAt: string | null;
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
    return {
      orderId: resolvedId,
      paymentId: payment?.id?.trim() || null,
      status: mapMercadoPagoOrderStatus(
        order.status ?? payment?.status,
        order.status_detail ?? payment?.status_detail,
      ),
      amountBrl: parseBrlAmount(order.total_amount ?? payment?.amount),
      currency: 'BRL',
      externalReference: order.external_reference?.trim() || null,
      expiresAt: payment?.date_of_expiration?.trim() || null,
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

    const dataId = extractMercadoPagoDataId(payload, meta.query) ?? undefined;
    const ok = verifyMercadoPagoWebhookSignature({
      secret,
      xSignature: meta.xSignature,
      xRequestId: meta.xRequestId,
      dataId,
    });
    if (!ok) {
      throw new UnauthorizedException('Assinatura do webhook inválida');
    }
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
    this.assertSandboxNotInProduction();
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

  private assertSandboxNotInProduction(): void {
    if (isProduction() && isMercadoPagoSandbox()) {
      throw new ServiceUnavailableException(
        'PIX Sandbox não pode ser usado em produção.',
      );
    }
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
