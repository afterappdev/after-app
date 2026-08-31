import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AccountDeletionMail, AccountDeletionMailer } from './account-deletion.mailer';
import { isProduction } from '../common/env';
import { maskEmailForLog, sanitizeConfirmUrlForLog } from './account-deletion.crypto';

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

export function smtpPortFromEnv(): number {
  const raw = Number(env('SMTP_PORT'));
  return Number.isFinite(raw) && raw > 0 ? raw : 587;
}

/** SMTPS implícito (TLS desde o connect). 587/2587 usam STARTTLS. */
export function smtpUsesImplicitTls(port: number): boolean {
  return port === 465 || port === 2465;
}

export function buildSmtpTransportOptions(): SMTPTransport.Options {
  const host = env('SMTP_HOST');
  const port = smtpPortFromEnv();
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASSWORD');
  const implicitTls = smtpUsesImplicitTls(port);
  return {
    host,
    port,
    secure: implicitTls,
    auth: user ? { user, pass } : undefined,
    requireTLS: !implicitTls,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  };
}

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN_QUERY = /token=[^&\s]*/gi;
const RESEND_KEY = /\bre_[A-Za-z0-9]+\b/g;

export function sanitizeSmtpLogText(value: unknown): string {
  let text = String(value ?? '');
  const password = env('SMTP_PASSWORD');
  if (password) {
    text = text.split(password).join('[redacted]');
  }
  text = text.replace(RESEND_KEY, '[redacted]');
  text = text.replace(TOKEN_QUERY, 'token=***');
  text = text.replace(EMAIL_IN_TEXT, (email) => maskEmailForLog(email));
  return text.slice(0, 500);
}

export function sanitizeSmtpError(err: unknown): {
  code?: string;
  command?: string;
  responseCode?: number;
  response?: string;
  message?: string;
} {
  const e = err as {
    code?: string;
    command?: string;
    responseCode?: number;
    response?: string;
    message?: string;
  };
  return {
    code: e?.code ? sanitizeSmtpLogText(e.code) : undefined,
    command: e?.command ? sanitizeSmtpLogText(e.command) : undefined,
    responseCode:
      typeof e?.responseCode === 'number' ? e.responseCode : undefined,
    response: e?.response ? sanitizeSmtpLogText(e.response) : undefined,
    message: e?.message ? sanitizeSmtpLogText(e.message) : 'SMTP erro',
  };
}

@Injectable()
export class SmtpAccountDeletionMailer extends AccountDeletionMailer {
  private readonly logger = new Logger(SmtpAccountDeletionMailer.name);

  isConfigured(): boolean {
    return Boolean(env('SMTP_HOST') && env('SMTP_FROM'));
  }

  async sendDeletionLink(mail: AccountDeletionMail): Promise<void> {
    if (!this.isConfigured()) {
      if (!isProduction()) {
        this.logger.log(
          `SMTP ausente; link de exclusão não enviado (${sanitizeConfirmUrlForLog(mail.confirmUrl)})`,
        );
      }
      return;
    }

    const transporter = nodemailer.createTransport(buildSmtpTransportOptions());
    try {
      await transporter.sendMail({
        from: env('SMTP_FROM'),
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
      });
    } catch (err) {
      this.logger.warn(`SMTP falhou ${JSON.stringify(sanitizeSmtpError(err))}`);
      throw err;
    } finally {
      transporter.close();
    }

    if (!isProduction()) {
      this.logger.log(
        `Instruções de exclusão enviadas para ${maskEmailForLog(mail.to)}`,
      );
    }
  }
}
