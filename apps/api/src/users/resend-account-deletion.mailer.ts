import { Injectable, Logger } from '@nestjs/common';
import { AccountDeletionMail, AccountDeletionMailer } from './account-deletion.mailer';
import { isProduction } from '../common/env';
import { maskEmailForLog, sanitizeConfirmUrlForLog } from './account-deletion.crypto';

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
export const ACCOUNT_DELETION_FROM = 'After <nao-responda@app-after.com.br>';

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN_QUERY = /token=[^&\s]*/gi;
const RESEND_KEY = /\bre_[A-Za-z0-9]+\b/g;

export function sanitizeMailerLogText(value: unknown): string {
  let text = String(value ?? '');
  for (const secret of [env('RESEND_API_KEY'), env('SMTP_PASSWORD')]) {
    if (secret) {
      text = text.split(secret).join('[redacted]');
    }
  }
  text = text.replace(RESEND_KEY, '[redacted]');
  text = text.replace(TOKEN_QUERY, 'token=***');
  text = text.replace(EMAIL_IN_TEXT, (email) => maskEmailForLog(email));
  return text.slice(0, 500);
}

export function sanitizeMailerError(err: unknown): {
  status?: number;
  name?: string;
  code?: string;
  message?: string;
} {
  const e = err as {
    status?: number;
    statusCode?: number;
    name?: string;
    code?: string;
    resendName?: string;
    message?: string;
  };
  const status =
    typeof e?.status === 'number'
      ? e.status
      : typeof e?.statusCode === 'number'
        ? e.statusCode
        : undefined;
  const name = e?.resendName || e?.name;
  const code = e?.code || e?.resendName;
  return {
    status,
    name: name ? sanitizeMailerLogText(name) : undefined,
    code: code ? sanitizeMailerLogText(code) : undefined,
    message: sanitizeMailerLogText(e?.message || name || 'erro de e-mail'),
  };
}

export class ResendHttpError extends Error {
  readonly status: number;
  readonly resendName?: string;
  readonly code?: string;

  constructor(
    status: number,
    payload: { name?: string; message?: string; statusCode?: number },
  ) {
    super(payload.message || `Resend HTTP ${status}`);
    this.name = 'ResendHttpError';
    this.status = status;
    this.resendName = payload.name;
    this.code = payload.name;
  }
}

function deletionEmailText(confirmUrl: string): string {
  return [
    'Recebemos um pedido para excluir a conta After deste e-mail.',
    '',
    'Se foi você, abra o link abaixo e confirme a exclusão. O link expira em 60 minutos e só pode ser usado uma vez.',
    '',
    confirmUrl,
    '',
    'Se você não pediu isso, ignore este e-mail. Nenhuma conta será excluída sem essa confirmação.',
  ].join('\n');
}

@Injectable()
export class ResendAccountDeletionMailer extends AccountDeletionMailer {
  private readonly logger = new Logger(ResendAccountDeletionMailer.name);

  isConfigured(): boolean {
    return Boolean(env('RESEND_API_KEY'));
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

    const apiKey = env('RESEND_API_KEY');
    const from = env('RESEND_FROM') || ACCOUNT_DELETION_FROM;

    try {
      const res = await fetch(RESEND_EMAILS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'after-api/account-deletion',
        },
        body: JSON.stringify({
          from,
          to: [mail.to],
          subject: 'Exclusão da sua conta After',
          text: deletionEmailText(mail.confirmUrl),
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          name?: string;
          message?: string;
          statusCode?: number;
        };
        throw new ResendHttpError(res.status, payload);
      }
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
