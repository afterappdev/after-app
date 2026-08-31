import { maskEmailForLog } from '../../users/account-deletion.crypto';

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
export const DEFAULT_RESEND_FROM = 'After <nao-responda@app-after.com.br>';

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN_QUERY = /token=[^&\s]*/gi;
const RESEND_KEY = /\bre_[A-Za-z0-9]+\b/g;

export function isResendConfigured(): boolean {
  return Boolean(env('RESEND_API_KEY'));
}

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

export async function sendResendEmail(input: {
  to: string;
  subject: string;
  text: string;
  userAgent?: string;
}): Promise<void> {
  const apiKey = env('RESEND_API_KEY');
  if (!apiKey) {
    throw new Error('Resend não configurado');
  }

  const res = await fetch(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': input.userAgent || 'after-api/resend',
    },
    body: JSON.stringify({
      from: env('RESEND_FROM') || DEFAULT_RESEND_FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text,
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
}
