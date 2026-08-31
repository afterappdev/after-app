import { createHash, randomBytes } from 'crypto';

export const ACCOUNT_DELETION_TOKEN_TTL_MS = 60 * 60 * 1000;

export const ACCOUNT_DELETION_REQUEST_MESSAGE =
  'Se existir uma conta com esse e-mail, enviaremos instruções para exclusão.';

export const ACCOUNT_DELETION_INVALID_LINK_MESSAGE =
  'Este link é inválido ou já expirou.';

export const ACCOUNT_DELETION_MAIL_UNAVAILABLE_MESSAGE =
  'Não foi possível enviar as instruções agora. Tente novamente mais tarde.';

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateDeletionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDeletionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function maskEmailForLog(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  const domain = trimmed.slice(at + 1);
  return `${trimmed[0]}***@${domain}`;
}

export function buildDeletionConfirmUrl(appBaseUrl: string, token: string): string {
  const base = appBaseUrl.replace(/\/$/, '');
  return `${base}/#/confirmar-exclusao?token=${encodeURIComponent(token)}`;
}

export function sanitizeConfirmUrlForLog(url: string): string {
  return url.replace(/([?&]token=)[^&]*/i, '$1***');
}
