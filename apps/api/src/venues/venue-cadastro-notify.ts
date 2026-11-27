import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sendResendEmail, isResendConfigured } from '../common/resend/resend-email';
import { sanitizeMailerError } from '../users/resend-account-deletion.mailer';

const logger = new Logger('VenueCadastroNotify');

/**
 * Idempotent e-mail to venue owner after new venue row (initial or additional).
 * Uses same Resend path as account flows; skips if already sent or Resend off.
 */
export async function notifyVenueOwnerAfterCadastro(
  prisma: PrismaService,
  venueId: string,
): Promise<{ sent: boolean; skippedReason?: string }> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      avisoCadastroEnviadoAt: true,
      owner: { select: { email: true } },
    },
  });
  if (!venue) {
    return { sent: false, skippedReason: 'venue not found' };
  }
  if (venue.avisoCadastroEnviadoAt) {
    return { sent: false, skippedReason: 'already notified' };
  }
  const to = venue.owner.email?.trim();
  if (!to) {
    return { sent: false, skippedReason: 'owner email missing' };
  }
  if (!isResendConfigured()) {
    logger.warn(
      `Cadastro de local ${venue.id}: Resend não configurado; e-mail não enviado.`,
    );
    return { sent: false, skippedReason: 'Resend não configurado' };
  }

  try {
    await sendResendEmail({
      to,
      subject: `After — cadastro recebido: ${venue.name}`,
      text: [
        `Olá,`,
        ``,
        `Recebemos o cadastro do estabelecimento "${venue.name}".`,
        `A publicação no app depende de perfil completo (nome, endereço, logo, horários) e autorização manual da equipe.`,
        `Complete os dados no app; quando estiver tudo certo, liberamos a vitrine.`,
        ``,
        `— Equipe After`,
      ].join('\n'),
      userAgent: 'after-api/venue-cadastro',
    });
    await prisma.venue.update({
      where: { id: venueId },
      data: { avisoCadastroEnviadoAt: new Date() },
    });
    return { sent: true };
  } catch (err) {
    logger.warn(
      `Falha ao enviar aviso de cadastro ${JSON.stringify(sanitizeMailerError(err))}`,
    );
    return { sent: false, skippedReason: 'send failed' };
  }
}
