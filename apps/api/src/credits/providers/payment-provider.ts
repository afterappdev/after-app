import { BadRequestException } from '@nestjs/common';

export const CANONICAL_PAYMENT_PROVIDERS = [
  'google_play',
  'app_store',
  'pix',
] as const;

export type CanonicalPaymentProvider =
  (typeof CANONICAL_PAYMENT_PROVIDERS)[number];

const PROVIDER_ALIASES: Record<string, CanonicalPaymentProvider> = {
  google_play: 'google_play',
  app_store: 'app_store',
  apple_app_store: 'app_store',
  pix: 'pix',
};

export const STORE_PROVIDER_INPUTS = [
  'google_play',
  'app_store',
  'apple_app_store',
] as const;

export type StoreProviderInput = (typeof STORE_PROVIDER_INPUTS)[number];

export function normalizeProviderId(raw: string): CanonicalPaymentProvider {
  const key = (raw ?? '').trim().toLowerCase();
  const normalized = PROVIDER_ALIASES[key];
  if (!normalized) {
    throw new BadRequestException('Provedor de pagamento inválido');
  }
  return normalized;
}

export function buildProviderTxId(
  provider: CanonicalPaymentProvider,
  externalId: string,
): string {
  const id = (externalId ?? '').trim();
  if (!id) {
    throw new BadRequestException('Identificador de transação inválido');
  }
  return `${provider}:${id}`;
}

/** Real Mercado Pago Order id persisted after PIX create. Ignores pending/duplicate placeholders. */
export function pixOrderIdFromProviderTxId(
  providerTxId?: string | null,
): string | null {
  if (!providerTxId) return null;
  const prefix = 'pix:';
  if (!providerTxId.startsWith(prefix)) return null;
  const externalId = providerTxId.slice(prefix.length).trim();
  if (!externalId) return null;
  if (externalId.startsWith('pending:') || externalId.startsWith('duplicate:')) {
    return null;
  }
  if (/^\d+$/.test(externalId)) return null;
  return externalId;
}

export type StoreVerifyInput = {
  productId: string;
  purchaseId: string;
  verificationData: string;
};

export type VerifiedPayment = {
  provider: CanonicalPaymentProvider;
  productId: string;
  externalId: string;
};

export interface PaymentProvider {
  readonly id: CanonicalPaymentProvider;
  readonly isConfigured: boolean;
}

export interface StorePaymentProvider extends PaymentProvider {
  verify(input: StoreVerifyInput): Promise<VerifiedPayment>;
}
