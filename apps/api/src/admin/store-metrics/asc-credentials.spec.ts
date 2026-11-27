import { resolveAscCredentials } from './asc-credentials';

describe('resolveAscCredentials', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('retorna null se faltar issuer, key id ou private key', () => {
    delete process.env.APP_STORE_CONNECT_ISSUER_ID;
    delete process.env.APP_STORE_CONNECT_KEY_ID;
    delete process.env.APP_STORE_CONNECT_PRIVATE_KEY;
    expect(resolveAscCredentials()).toBeNull();

    process.env.APP_STORE_CONNECT_ISSUER_ID = 'iss';
    expect(resolveAscCredentials()).toBeNull();

    process.env.APP_STORE_CONNECT_KEY_ID = 'm-key';
    expect(resolveAscCredentials()).toBeNull();
  });

  it('usa só APP_STORE_CONNECT_* e ignora APPLE_*', () => {
    process.env.APP_STORE_CONNECT_ISSUER_ID = 'iss';
    process.env.APP_STORE_CONNECT_KEY_ID = 'm-key';
    process.env.APP_STORE_CONNECT_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY-----';
    process.env.APPLE_KEY_ID = 'a-key';
    process.env.APPLE_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\nY\n-----END PRIVATE KEY-----';
    const creds = resolveAscCredentials();
    expect(creds?.keyId).toBe('m-key');
    expect(creds?.issuerId).toBe('iss');
    expect(creds?.source).toBe('metrics');
  });
});