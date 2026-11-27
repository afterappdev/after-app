import { createPrivateKey, sign as cryptoSign } from 'crypto';
import { resolveAscCredentials } from './asc-credentials';

export function createAppStoreConnectJwt(): string | null {
  const creds = resolveAscCredentials();
  if (!creds) return null;
  const { issuerId, keyId, privateKey } = creds;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: issuerId,
      iat: now,
      exp: now + 300,
      aud: 'appstoreconnect-v1',
    }),
  );
  const unsigned = `${header}.${claim}`;
  try {
    const key = createPrivateKey(privateKey);
    const signature = cryptoSign('sha256', Buffer.from(unsigned), {
      key,
      dsaEncoding: 'ieee-p1363',
    });
    return `${unsigned}.${signature.toString('base64url')}`;
  } catch {
    return null;
  }
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}
