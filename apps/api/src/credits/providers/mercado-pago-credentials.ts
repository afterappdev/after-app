import { ServiceUnavailableException } from '@nestjs/common';
import { isMercadoPagoSandbox, isProduction } from '../../common/env';

/**
 * Checkout API Orders documents the test Access Token with the same
 * `APP_USR-` prefix as the production Access Token. `TEST-` is an older
 * test prefix and is unambiguous.
 */
export type MercadoPagoAccessTokenKind = 'test' | 'shared' | 'unknown';

/** Public Key `APP_USR-` is not proof of production. `TEST-` is a test key. */
export type MercadoPagoPublicKeyKind = 'test' | 'shared' | 'unknown';

export function mercadoPagoAccessTokenKind(
  value: string | null | undefined,
): MercadoPagoAccessTokenKind {
  const trimmed = value?.trim() ?? '';
  if (trimmed.startsWith('TEST-')) return 'test';
  if (trimmed.startsWith('APP_USR-')) return 'shared';
  return 'unknown';
}

export function mercadoPagoPublicKeyKind(
  value: string | null | undefined,
): MercadoPagoPublicKeyKind {
  const trimmed = value?.trim() ?? '';
  if (trimmed.startsWith('TEST-')) return 'test';
  if (trimmed.startsWith('APP_USR-')) return 'shared';
  return 'unknown';
}

/**
 * Blocks a new PIX charge when production would use Sandbox mode or a
 * `TEST-` Access Token. An `APP_USR-` token is not treated as production:
 * the Orders test token uses that prefix too.
 * Reconciliation reads existing orders and does not call this.
 */
export function assertMercadoPagoPixChargeAllowed(): void {
  if (isProduction() && isMercadoPagoSandbox()) {
    throw new ServiceUnavailableException(
      'PIX Sandbox não pode ser usado em produção.',
    );
  }
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!token) return;
  assertAccessTokenAllowed(token);
}

/**
 * Same Access Token rules as PIX, plus a refusal to use a `TEST-` Public Key
 * in production. The Public Key prefix `APP_USR-` does not select the environment.
 */
export function assertMercadoPagoCardChargeAllowed(): void {
  if (isProduction() && isMercadoPagoSandbox()) {
    throw new ServiceUnavailableException(
      'Cartão Sandbox não pode ser usado em produção.',
    );
  }
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY?.trim();
  if (!token && !publicKey) return;
  if (token) assertAccessTokenAllowed(token);
  if (isProduction() && mercadoPagoPublicKeyKind(publicKey) === 'test') {
    throw new ServiceUnavailableException(
      'Credenciais Sandbox do Mercado Pago não podem ser usadas em produção.',
    );
  }
  if (!token || !publicKey) {
    if (!token) return;
    throw new ServiceUnavailableException(
      'Cartão de crédito ainda não está disponível.',
    );
  }
}

function assertAccessTokenAllowed(token: string): void {
  if (isProduction() && mercadoPagoAccessTokenKind(token) === 'test') {
    throw new ServiceUnavailableException(
      'Credenciais Sandbox do Mercado Pago não podem ser usadas em produção.',
    );
  }
}
