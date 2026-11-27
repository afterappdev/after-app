import { Logger } from '@nestjs/common';
import { CreditPurchase } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isResendConfigured, sendResendEmail } from '../common/resend/resend-email';
import { sanitizeMailerError } from '../users/resend-account-deletion.mailer';
import { asMoney } from './purchase-public';

const logger = new Logger('FiscalInvoiceMail');

export const FISCAL_INVOICE_TO = 'contato@r2ptech.com.br';

const PROVIDER_LABEL: Record<string, string> = {
  pix: 'PIX',
  card: 'Cartão de crédito',
  google_play: 'Google Play',
  app_store: 'Apple',
};

export function formatFiscalDocument(
  personType: string | null | undefined,
  digits: string | null | undefined,
): string {
  const raw = (digits ?? '').replace(/\D/g, '');
  if (personType === 'CPF' && raw.length === 11) {
    return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6, 9)}-${raw.slice(9)}`;
  }
  if (personType === 'CNPJ' && raw.length === 14) {
    return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}/${raw.slice(8, 12)}-${raw.slice(12)}`;
  }
  return raw || '—';
}

export function formatBrl(value: unknown): string {
  const amount = asMoney(value);
  const [whole, cents] = amount.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${grouped},${cents}`;
}

function formatWhen(value: Date | null | undefined): string {
  const date = value ?? new Date();
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function buildFiscalInvoiceEmail(input: {
  purchase: Pick<
    CreditPurchase,
    | 'id'
    | 'packageKey'
    | 'credits'
    | 'amountPaid'
    | 'provider'
    | 'confirmedAt'
    | 'createdAt'
    | 'fiscalPersonType'
    | 'fiscalName'
    | 'fiscalDocument'
    | 'fiscalEmail'
  >;
  venueName: string;
  city: string;
  state: string;
  ownerName: string | null;
  ownerEmail: string | null;
}): { to: string; subject: string; text: string } {
  const purchase = input.purchase;
  const provider = purchase.provider
    ? (PROVIDER_LABEL[purchase.provider] ?? purchase.provider)
    : '—';
  const lines = [
    'O estabelecimento pediu emissão de nota fiscal na compra de créditos.',
    '',
    `Estabelecimento: ${input.venueName}`,
    `Cidade: ${input.city} / ${input.state}`,
    `Responsável: ${input.ownerName?.trim() || '—'}`,
    `E-mail da conta: ${input.ownerEmail?.trim() || '—'}`,
    '',
    `Nome ou razão social: ${purchase.fiscalName?.trim() || '—'}`,
    `Documento: ${purchase.fiscalPersonType || '—'} ${formatFiscalDocument(purchase.fiscalPersonType, purchase.fiscalDocument)}`,
    `E-mail para a nota: ${purchase.fiscalEmail?.trim() || '—'}`,
    '',
    `Compra: ${purchase.id}`,
    `Pacote: ${purchase.packageKey}`,
    `Créditos: ${purchase.credits}`,
    `Valor pago: ${formatBrl(purchase.amountPaid)}`,
    `Pagamento: ${provider}`,
    `Confirmada em: ${formatWhen(purchase.confirmedAt ?? purchase.createdAt)}`,
  ];
  return {
    to: FISCAL_INVOICE_TO,
    subject: `After — nota fiscal: ${input.venueName}`,
    text: lines.join('\n'),
  };
}

export async function notifyFiscalInvoiceRequest(
  prisma: PrismaService,
  purchase: CreditPurchase,
): Promise<{ sent: boolean; skippedReason?: string }> {
  if (!purchase.invoiceRequested) {
    return { sent: false, skippedReason: 'not requested' };
  }
  if (!isResendConfigured()) {
    logger.warn(
      `Nota fiscal da compra ${purchase.id}: Resend não configurado; e-mail não enviado.`,
    );
    return { sent: false, skippedReason: 'Resend não configurado' };
  }

  const venue = await prisma.venue.findUnique({
    where: { id: purchase.venueId },
    select: {
      name: true,
      city: true,
      state: true,
      owner: { select: { name: true, email: true } },
    },
  });
  if (!venue) {
    return { sent: false, skippedReason: 'venue not found' };
  }

  const message = buildFiscalInvoiceEmail({
    purchase,
    venueName: venue.name,
    city: venue.city,
    state: venue.state,
    ownerName: venue.owner.name,
    ownerEmail: venue.owner.email,
  });

  try {
    await sendResendEmail({
      to: message.to,
      subject: message.subject,
      text: message.text,
      userAgent: 'after-api/fiscal-invoice',
    });
    return { sent: true };
  } catch (err) {
    logger.warn(
      `Falha ao enviar pedido de nota ${purchase.id} ${JSON.stringify(sanitizeMailerError(err))}`,
    );
    return { sent: false, skippedReason: 'send failed' };
  }
}
