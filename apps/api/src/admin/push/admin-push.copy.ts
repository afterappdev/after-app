import { Logger } from '@nestjs/common';
import { CreditPurchase, Role } from '@prisma/client';
import { isRealSaleProvider } from '../finance';
import { toMoneyNumber } from '../money';

export const ADMIN_PUSH_TYPES = {
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  VENUE_CREATED: 'VENUE_CREATED',
  PURCHASE_PAID: 'PURCHASE_PAID',
  REPORT_CREATED: 'REPORT_CREATED',
  COUPON_REDEEMED: 'COUPON_REDEEMED',
} as const;

export function providerLabel(provider: string | null | undefined): string {
  switch ((provider ?? '').trim().toLowerCase()) {
    case 'google_play':
      return 'Google Play';
    case 'app_store':
      return 'Apple';
    case 'pix':
      return 'PIX';
    case 'card':
      return 'Cartão de crédito';
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
  const provider = (purchase.provider ?? '').trim().toLowerCase();
  if (provider === 'stub') return false;
  // Card sales are real purchases. The admin finance provider list on this
  // commit still omits card, so the push must not depend on that list.
  if (provider === 'card') return true;
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
    title: 'Novo estabelecimento cadastrado 🏪',
    body: trimmed
      ? `${trimmed} acabou de se cadastrar no After.`
      : 'Um novo estabelecimento acabou de se cadastrar no After.',
  };
}

export function purchasePaidCopy(input: {
  credits: number;
  amountPaid: unknown;
  provider: string | null | undefined;
  venueName?: string | null;
}) {
  if ((input.provider ?? '').trim().toLowerCase() === 'card') {
    return cardPurchaseCopy(input);
  }
  const creditsLabel =
    input.credits === 1
      ? '1 crédito vendido'
      : `${input.credits} créditos vendidos`;
  const sale = `${creditsLabel} por ${formatBrl(input.amountPaid)} via ${providerLabel(input.provider)}.`;
  const venueName = input.venueName?.trim();
  return {
    title: 'Nova venda no After',
    body: venueName ? `${venueName} — ${sale}` : sale,
  };
}

function cardPurchaseCopy(input: {
  credits: number;
  amountPaid: unknown;
  venueName?: string | null;
}) {
  const creditsLabel =
    input.credits === 1 ? '1 crédito' : `${input.credits} créditos`;
  const venueName = input.venueName?.trim() || 'Um estabelecimento';
  return {
    title: 'Nova compra de créditos 💳',
    body: `${venueName} comprou ${creditsLabel} por ${formatBrl(input.amountPaid)} via cartão de crédito.`,
  };
}

export function reportCreatedCopy(input: {
  targetType: string;
  reason?: string | null;
  snapshot?: unknown;
}) {
  const kind = reportKindLabel(input.targetType);
  return {
    title: 'Nova denúncia recebida 🚩',
    body: `Uma nova denúncia de ${kind} foi registrada no After. Motivo: ${reportReasonLabel(input.reason)}.`,
  };
}

export function couponRedeemedCopy(input: {
  code: string;
  venueName?: string | null;
}) {
  const code = input.code.trim();
  const venueName = input.venueName?.trim();
  return {
    title: 'Cupom utilizado 🎟️',
    body: venueName
      ? `O cupom ${code} foi utilizado no estabelecimento ${venueName}.`
      : `O cupom ${code} foi utilizado em um estabelecimento.`,
  };
}

function reportKindLabel(targetType: string): string {
  switch (targetType.trim().toUpperCase()) {
    case 'VENUE':
      return 'estabelecimento';
    case 'BANNER':
      return 'promoção';
    case 'PHOTO':
      return 'foto';
    case 'VIDEO':
      return 'vídeo';
    case 'REVIEW':
      return 'comentário';
    default:
      return 'outro';
  }
}

function reportReasonLabel(reason: string | null | undefined): string {
  switch ((reason ?? '').trim().toUpperCase()) {
    case 'INAPPROPRIATE':
      return 'conteúdo impróprio';
    case 'SPAM':
      return 'spam';
    case 'MISLEADING':
      return 'informação enganosa';
    case 'VIOLENCE':
      return 'violência';
    case 'SEXUAL':
      return 'conteúdo sexual';
    case 'HATE':
      return 'discurso de ódio';
    case 'COPYRIGHT':
      return 'direitos autorais';
    case 'OTHER':
      return 'outro';
    default:
      return 'outro';
  }
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
