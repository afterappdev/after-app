import { normalizeApplePrivateKey } from '../../auth/apple-web.util';

export type AscCredentials = {
  issuerId: string;
  keyId: string;
  privateKey: string;
  source: 'metrics';
};

/** JWT do dashboard de downloads (ASC) — somente APP_STORE_CONNECT_* */
export function resolveAscCredentials(): AscCredentials | null {
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID?.trim() ?? '';
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID?.trim() ?? '';
  const privateKey = normalizeApplePrivateKey(
    process.env.APP_STORE_CONNECT_PRIVATE_KEY,
  );
  if (!issuerId || !keyId || !privateKey) return null;

  return {
    issuerId,
    keyId,
    privateKey,
    source: 'metrics',
  };
}