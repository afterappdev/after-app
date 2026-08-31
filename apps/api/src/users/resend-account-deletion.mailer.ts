import { Injectable, Logger } from '@nestjs/common';
import { AccountDeletionMail, AccountDeletionMailer } from './account-deletion.mailer';
import { isProduction } from '../common/env';
import { maskEmailForLog, sanitizeConfirmUrlForLog } from './account-deletion.crypto';
import {
  isResendConfigured,
  sanitizeMailerError,
  sendResendEmail,
} from '../common/resend/resend-email';

export {
  DEFAULT_RESEND_FROM as ACCOUNT_DELETION_FROM,
  RESEND_EMAILS_URL,
  ResendHttpError,
  sanitizeMailerError,
  sanitizeMailerLogText,
} from '../common/resend/resend-email';

@Injectable()
export class ResendAccountDeletionMailer extends AccountDeletionMailer {
  private readonly logger = new Logger(ResendAccountDeletionMailer.name);

  isConfigured(): boolean {
    return isResendConfigured();
  }

  async sendDeletionLink(mail: AccountDeletionMail): Promise<void> {
    if (!this.isConfigured()) {
      if (!isProduction()) {
        this.logger.log(
          `Resend ausente; link de exclusão não enviado (${sanitizeConfirmUrlForLog(mail.confirmUrl)})`,
        );
      }
      return;
    }

    try {
      await sendResendEmail({
        to: mail.to,
        subject: 'Exclusão da sua conta After',
        text: [
          'Recebemos um pedido para excluir a conta After deste e-mail.',
          '',
          'Se foi você, abra o link abaixo e confirme a exclusão. O link expira em 60 minutos e só pode ser usado uma vez.',
          '',
          mail.confirmUrl,
          '',
          'Se você não pediu isso, ignore este e-mail. Nenhuma conta será excluída sem essa confirmação.',
        ].join('\n'),
        userAgent: 'after-api/account-deletion',
      });
    } catch (err) {
      this.logger.warn(
        `Resend falhou ${JSON.stringify(sanitizeMailerError(err))}`,
      );
      throw err;
    }

    if (!isProduction()) {
      this.logger.log(
        `Instruções de exclusão enviadas para ${maskEmailForLog(mail.to)}`,
      );
    }
  }
}
