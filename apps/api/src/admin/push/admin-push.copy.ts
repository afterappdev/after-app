import { Logger } from '@nestjs/common';
import { CreditPurchase, Role } from '@prisma/client';
import { isRealSaleProvider } from '../finance';
import { toMoneyNumber } from '../money';

export const ADMIN_PUSH_TYPES = {
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  VENUE_CREATED: 'VENUE_CREATED',
  PURCHASE_PAID: 'PURCHASE_PAID',
} as const;

export function providerLabel(provider: string | null | undefined): string {
  switch ((provider ?? '').trim().toLowerCase()) {
    case 'google_play':
      return 'Google Play';
    case 'app_store':
      return 'Apple';
    case 'pix':
      return 'PIX';
    default:
      return 'pagamento';
  }
}

export function formatBrl(value: unknown): string {
  const amount = toMoneyNumber(value as never);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

export function isRealPaidSale(
  purchase: Pick<
    CreditPurchase,
    'status' | 'packageKey' | 'provider' | 'confirmedAt'
  >,
): boolean {
  if (purchase.status !== 'PAID') return false;
  if (!purchase.confirmedAt) return false;
  const packageKey = purchase.packageKey?.trim().toLowerCase();
  if (packageKey === 'welcome' || packageKey === 'stub') return false;
  if ((purchase.provider ?? '').trim().toLowerCase() === 'stub') return false;
  return isRealSaleProvider(purchase.provider);
}

export function accountCreatedCopy(
  role: Role,
  name: string | null | undefined,
) {
  const trimmed = name?.trim();
  if (role === Role.VENUE) {
    return {
      title: 'Nova conta no After',
      body: trimmed
        ? `${trimmed} criou uma conta de estabelecimento.`
        : 'Uma nova conta de estabelecimento foi criada.',
    };
  }
  return {
    title: 'Nova conta no After',
    body: trimmed
      ? `${trimmed} criou uma conta de usuário.`
      : 'Uma nova conta de usuário foi criada.',
  };
}

export function venueCreatedCopy(venueName: string | null | undefined) {
  const trimmed = venueName?.trim();
  return {
    title: 'Novo estabelecimento',
    body: trimmed
      ? `${trimmed} foi cadastrado no After.`
      : 'Um novo estabelecimento foi cadastrado no After.',
  };
}

export function purchasePaidCopy(input: {
  credits: number;
  amountPaid: unknown;
  provider: string | null | undefined;
}) {
  const creditsLabel =
    input.credits === 1
      ? '1 crédito vendido'
      : `${input.credits} créditos vendidos`;
  return {
    title: 'Nova venda no After',
    body: `${creditsLabel} por ${formatBrl(input.amountPaid)} via ${providerLabel(input.provider)}.`,
  };
}

export function safePushErrorMessage(error: unknown, logger: Logger): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const name =
    error instanceof Error
      ? error.name
      : typeof error === 'string'
        ? error
        : '';
  logger.warn(
    `Admin FCM delivery failed${code ? ` (${code})` : ''}${name ? `: ${name}` : ''}`,
  );
  if (code) return code.slice(0, 180);
  if (name) return name.slice(0, 180);
  return 'FCM_SEND_FAILED';
}
