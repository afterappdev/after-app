import { createHash, randomBytes } from 'crypto';

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const PASSWORD_RESET_REQUEST_MESSAGE =
  'Se existir uma conta elegível com esse e-mail, enviaremos instruções para redefinir a senha.';

export const PASSWORD_RESET_INVALID_LINK_MESSAGE =
  'Este link é inválido ou já expirou.';

export const PASSWORD_RESET_MAIL_UNAVAILABLE_MESSAGE =
  'Não foi possível enviar as instruções agora. Tente novamente mais tarde.';

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function buildPasswordResetUrl(appBaseUrl: string, token: string): string {
  const base = appBaseUrl.replace(/\/$/, '');
  return `${base}/#/redefinir-senha?token=${encodeURIComponent(token)}`;
}
