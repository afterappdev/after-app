import appleSignin from 'apple-signin-auth';

export const APPLE_CLIENT_SECRET_EXP_SECONDS = 5 * 60;
export const APPLE_ISSUER = 'https://appleid.apple.com';

export function normalizeApplePrivateKey(
  raw: string | undefined | null,
): string {
  if (!raw) return '';
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }
  return key.trim();
}

export function createAppleClientSecret(input: {
  teamId: string;
  serviceId: string;
  keyId: string;
  privateKey: string;
  expAfterSeconds?: number;
}): string {
  return appleSignin.getClientSecret({
    clientID: input.serviceId,
    teamID: input.teamId,
    keyIdentifier: input.keyId,
    privateKey: normalizeApplePrivateKey(input.privateKey),
    expAfter: input.expAfterSeconds ?? APPLE_CLIENT_SECRET_EXP_SECONDS,
  });
}

export function isAppleUserCancel(error?: string | null): boolean {
  const value = (error ?? '').trim().toLowerCase();
  return (
    value === 'user_cancelled_authorize' ||
    value === 'user_canceled' ||
    value === 'user_cancelled' ||
    value === 'access_denied' ||
    value === 'cancelled' ||
    value === 'canceled'
  );
}

export function parseAppleUserPayload(raw: unknown): {
  fullName?: string;
  email?: string;
} {
  if (raw == null || raw === '') return {};
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const record = parsed as {
    email?: unknown;
    name?: { firstName?: unknown; lastName?: unknown };
  };
  const fullName = [record.name?.firstName, record.name?.lastName]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .trim();
  const email = typeof record.email === 'string' ? record.email.trim() : '';
  return {
    ...(fullName ? { fullName } : {}),
    ...(email ? { email } : {}),
  };
}

export function sanitizeAppleLogError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown';
  return message
    .replace(/-----BEGIN[\s\S]+?-----END [A-Z ]+-----/g, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
    .slice(0, 180);
}
