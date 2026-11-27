import { createHash, randomBytes, randomInt } from 'crypto';

export const VENUE_CLAIM_INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const VENUE_CLAIM_EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
export const VENUE_CLAIM_EMAIL_CODE_MAX_ATTEMPTS = 5;

export function generateVenueClaimInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashVenueClaimInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function buildVenueClaimAcceptUrl(appBaseUrl: string, token: string): string {
  const base = appBaseUrl.replace(/\/$/, '');
  return `${base}/app/#/aceitar-perfil?token=${encodeURIComponent(token)}`;
}

export function generateVenueClaimEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashVenueClaimEmailCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}