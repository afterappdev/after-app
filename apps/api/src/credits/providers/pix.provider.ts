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
  mapMercadoPagoOrderStatus,
  mercadoPagoPublicErrorMessage,
  parseBrlAmount,
  sanitizeProviderError,
  verifyMercadoPagoWebhookSignature,
} from './mercado-pago-orders';

/** Payer overlay used only when MERCADO_PAGO_SANDBOX=true (never in production). */
export const MERCADO_PAGO_SANDBOX_PAYER = {
  email: 'test_user_br@testuser.com',
  firstName: 'APRO',
} as const;

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
        `Mercado Pago create order failed (${result.status}) ${mpErrorCode(result.data)}`,
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
        `Mercado Pago get order failed (${result.status}) ${mpErrorCode(result.data)}`,
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
    const email = input.payerEmail?.trim();
    if (!email) {
      throw new BadRequestException(
        'E-mail do pagador ausente no perfil. Atualize o cadastro para pagar com PIX.',
      );
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

function mpErrorCode(data: unknown): string {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const errors = record?.errors;
  const first = Array.isArray(errors) && errors[0] && typeof errors[0] === 'object'
    ? (errors[0] as Record<string, unknown>)
    : null;
  const code = first?.code ?? record?.error ?? record?.message ?? '';
  return sanitizeProviderError(String(code)).slice(0, 80);
}
