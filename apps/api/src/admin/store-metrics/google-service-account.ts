import { createSign } from 'crypto';
import { existsSync, readFileSync } from 'fs';

export type ServiceAccountJson = {
  client_email?: string;
  private_key?: string;
};

export function readGooglePlayServiceAccount(): ServiceAccountJson | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  let jsonText = raw;
  if (existsSync(raw)) {
    jsonText = readFileSync(raw, 'utf8');
  }
  try {
    const sa = JSON.parse(jsonText) as ServiceAccountJson;
    if (!sa.client_email || !sa.private_key) return null;
    return sa;
  } catch {
    return null;
  }
}

export async function googleAccessToken(scopes: string[]): Promise<string | null> {
  const sa = readGooglePlayServiceAccount();
  if (!sa?.client_email || !sa.private_key) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: scopes.join(' '),
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const jwt = `${unsigned}.${signer.sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const payload = (await res.json()) as { access_token?: string };
  return payload.access_token ?? null;
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}
