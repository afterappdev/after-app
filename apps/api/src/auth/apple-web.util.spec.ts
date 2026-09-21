import { generateKeyPairSync } from 'crypto';
import {
  createAppleClientSecret,
  normalizeApplePrivateKey,
  parseAppleUserPayload,
  isAppleUserCancel,
  sanitizeAppleLogError,
} from './apple-web.util';

function testPrivateKeyPem() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

function decodeJwt(token: string) {
  const [header, payload] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString()),
  };
}

describe('apple-web.util', () => {
  const pem = testPrivateKeyPem();

  it('normaliza private key multilinha', () => {
    expect(normalizeApplePrivateKey(pem)).toContain('BEGIN PRIVATE KEY');
    expect(normalizeApplePrivateKey(pem)).toContain('\n');
  });

  it('normaliza private key com \\n literal', () => {
    const literal = pem.replace(/\n/g, '\\n');
    expect(literal).toContain('\\n');
    expect(literal).not.toContain('\n');
    const normalized = normalizeApplePrivateKey(literal);
    expect(normalized).toBe(pem.trim());
    expect(normalized).toContain('\n');
  });

  it('gera client_secret ES256 com claims corretos', () => {
    const token = createAppleClientSecret({
      teamId: 'TEAMID1234',
      serviceId: 'com.r2p.after.web',
      keyId: 'KEYID12345',
      privateKey: pem,
      expAfterSeconds: 300,
    });
    const { header, payload } = decodeJwt(token);
    expect(header.alg).toBe('ES256');
    expect(header.kid).toBe('KEYID12345');
    expect(payload.iss).toBe('TEAMID1234');
    expect(payload.sub).toBe('com.r2p.after.web');
    expect(payload.aud).toBe('https://appleid.apple.com');
    expect(typeof payload.iat).toBe('number');
    expect(payload.exp - payload.iat).toBe(300);
  });

  it('gera client_secret a partir de chave com \\n literal', () => {
    const token = createAppleClientSecret({
      teamId: 'TEAMID1234',
      serviceId: 'com.r2p.after.web',
      keyId: 'KEYID12345',
      privateKey: pem.replace(/\n/g, '\\n'),
    });
    expect(token.split('.').length).toBe(3);
    expect(decodeJwt(token).header.alg).toBe('ES256');
  });

  it('faz parse defensivo do objeto user da Apple', () => {
    expect(
      parseAppleUserPayload(
        '{"name":{"firstName":"Ada","lastName":"Lovelace"},"email":"a@privaterelay.appleid.com"}',
      ),
    ).toEqual({
      fullName: 'Ada Lovelace',
      email: 'a@privaterelay.appleid.com',
    });
    expect(parseAppleUserPayload('not-json')).toEqual({});
    expect(parseAppleUserPayload(null)).toEqual({});
  });

  it('identifica cancelamento da Apple', () => {
    expect(isAppleUserCancel('user_cancelled_authorize')).toBe(true);
    expect(isAppleUserCancel('access_denied')).toBe(true);
    expect(isAppleUserCancel('invalid_request')).toBe(false);
  });

  it('redige tokens e JWTs em erros de log da Apple', () => {
    const token = createAppleClientSecret({
      teamId: 'TEAMID1234',
      clientId: 'com.r2p.after.afterApp',
      keyId: 'KEYID12345',
      privateKey: pem,
    });
    const sanitized = sanitizeAppleLogError(
      new Error(`refresh_token=apple-refresh client_secret=${token}`),
    );
    expect(sanitized).not.toContain('apple-refresh');
    expect(sanitized).not.toContain(token);
    expect(sanitized).toContain('[redacted]');
  });

  it('gera client_secret com clientId (Bundle ID nativo)', () => {
    const token = createAppleClientSecret({
      teamId: 'TEAMID1234',
      clientId: 'com.r2p.after.afterApp',
      keyId: 'KEYID12345',
      privateKey: pem,
    });
    const { payload } = decodeJwt(token);
    expect(payload.sub).toBe('com.r2p.after.afterApp');
  });
});
