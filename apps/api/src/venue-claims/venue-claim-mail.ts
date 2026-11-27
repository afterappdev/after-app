import { Logger } from '@nestjs/common';
import { isResendConfigured, sendResendEmail } from '../common/resend/resend-email';
import { sanitizeMailerError } from '../users/resend-account-deletion.mailer';

const logger = new Logger('VenueClaimMail');

/** Caixa interna padrão para novos pedidos de reivindicação. */
export const DEFAULT_VENUE_CLAIMS_NOTIFY_EMAIL = 'contato@app-after.com.br';

export function venueClaimsNotifyEmail(): string {
  const raw = process.env.VENUE_CLAIMS_NOTIFY_EMAIL?.trim();
  if (raw && raw.includes('@')) return raw;
  return DEFAULT_VENUE_CLAIMS_NOTIFY_EMAIL;
}

export async function notifyTeamNewVenueClaim(input: {
  protocol: string;
  venueName: string;
  requesterName: string;
  email: string;
  whatsapp?: string | null;
  adminClaimsUrl: string;
}): Promise<void> {
  if (!isResendConfigured()) {
    logger.warn(
      `Novo pedido ${input.protocol}: aviso interno não enviado (Resend ausente).`,
    );
    return;
  }
  const to = venueClaimsNotifyEmail();
  const wa = input.whatsapp?.trim();
  try {
    await sendResendEmail({
      to,
      subject: `After — reivindicação ${input.protocol}: ${input.venueName}`,
      text: [
        `Novo pedido de reivindicação.`,
        ``,
        `Local: ${input.venueName}`,
        `Protocolo: ${input.protocol}`,
        `Solicitante: ${input.requesterName}`,
        `E-mail: ${input.email}`,
        ...(wa ? [`WhatsApp: ${wa}`] : []),
        ``,
        `Abrir no Admin: ${input.adminClaimsUrl}`,
      ].join('\n'),
      userAgent: 'after-api/venue-claim-notify',
    });
  } catch (err) {
    logger.warn(
      `Falha ao avisar equipe sobre ${input.protocol}: ${JSON.stringify(sanitizeMailerError(err))}`,
    );
  }
}

export async function sendVenueClaimRequesterAck(input: {
  to: string;
  requesterName: string;
  venueName: string;
  protocol: string;
}): Promise<void> {
  if (!isResendConfigured()) {
    logger.warn(
      `Confirmação ${input.protocol}: Resend ausente — e-mail ao solicitante não enviado.`,
    );
    return;
  }
  const name = input.requesterName.trim() || 'Olá';
  try {
    await sendResendEmail({
      to: input.to,
      subject: `After — solicitação de reivindicação recebida (${input.protocol})`,
      text: [
        name === 'Olá' ? 'Olá,' : `Olá, ${name},`,
        ``,
        `Recebemos seu pedido para reivindicar o perfil de "${input.venueName}" no After.`,
        `Protocolo: ${input.protocol}`,
        ``,
        `Nossa equipe vai analisar e entrará em contato por e-mail ou WhatsApp.`,
        `Dúvidas: ${DEFAULT_VENUE_CLAIMS_NOTIFY_EMAIL}`,
        ``,
        `— Equipe After`,
      ].join('\n'),
      userAgent: 'after-api/venue-claim-ack',
    });
  } catch (err) {
    logger.warn(
      `Falha ao confirmar ${input.protocol} para solicitante: ${JSON.stringify(sanitizeMailerError(err))}`,
    );
  }
}

export async function sendVenueClaimInviteEmail(input: {
  to: string;
  venueName: string;
  inviteUrl: string;
  expiresAt: Date;
}): Promise<boolean> {
  if (!isResendConfigured()) {
    logger.warn(`Convite ${input.venueName}: Resend não configurado.`);
    return false;
  }
  try {
    await sendResendEmail({
      to: input.to,
      subject: `After — convite para administrar ${input.venueName}`,
      text: [
        `Olá,`,
        ``,
        `Sua solicitação para administrar "${input.venueName}" no After foi aprovada.`,
        `Use o link abaixo em até 72 horas (até ${input.expiresAt.toISOString()}):`,
        ``,
        input.inviteUrl,
        ``,
        `Você precisará confirmar o e-mail com um código enviado a esta caixa antes de concluir.`,
        ``,
        `— Equipe After`,
      ].join('\n'),
      userAgent: 'after-api/venue-claim-invite',
    });
    return true;
  } catch (err) {
    logger.warn(
      `Falha ao enviar convite: ${JSON.stringify(sanitizeMailerError(err))}`,
    );
    return false;
  }
}

export async function sendVenueClaimEmailConfirmCode(input: {
  to: string;
  venueName: string;
  code: string;
}): Promise<boolean> {
  if (!isResendConfigured()) {
    logger.warn(`Código confirmação ${input.venueName}: Resend não configurado.`);
    return false;
  }
  try {
    await sendResendEmail({
      to: input.to,
      subject: `After — código de confirmação (${input.venueName})`,
      text: [
        `Seu código para concluir a reivindicação de "${input.venueName}":`,
        ``,
        input.code,
        ``,
        `Válido por 15 minutos. Não compartilhe este código.`,
        ``,
        `— Equipe After`,
      ].join('\n'),
      userAgent: 'after-api/venue-claim-code',
    });
    return true;
  } catch (err) {
    logger.warn(
      `Falha ao enviar código: ${JSON.stringify(sanitizeMailerError(err))}`,
    );
    return false;
  }
}