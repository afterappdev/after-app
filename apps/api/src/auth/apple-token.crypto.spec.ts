import {
  APPLE_TOKEN_ENCRYPTION_KEY_BYTES,
  APPLE_TOKEN_ENCRYPTION_KEY_INVALID_MESSAGE,
  APPLE_TOKEN_ENCRYPTION_KEY_MISSING_MESSAGE,
  AppleTokenEncryptionKeyError,
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
  parseAppleTokenEncryptionKey,
} from './apple-token.crypto';

/** Test-only AES-256 key. Independent of JWT_SECRET and of production secrets. */
const TEST_KEY = Buffer.alloc(APPLE_TOKEN_ENCRYPTION_KEY_BYTES, 9);
const TEST_KEY_B64 = TEST_KEY.toString('base64');
const OTHER_KEY = Buffer.alloc(APPLE_TOKEN_ENCRYPTION_KEY_BYTES, 3);
const token = 'apple-refresh-token-value';

describe('apple refresh token crypto', () => {
  it('aceita Base64 de exatamente 32 bytes', () => {
    const parsed = parseAppleTokenEncryptionKey(TEST_KEY_B64);
    expect(parsed.length).toBe(32);
    expect(parsed.equals(TEST_KEY)).toBe(true);
  });

  it('rejeita chave ausente sem incluir JWT_SECRET na mensagem', () => {
    expect(() => parseAppleTokenEncryptionKey('')).toThrow(
      AppleTokenEncryptionKeyError,
    );
    expect(() => parseAppleTokenEncryptionKey(undefined)).toThrow(
      APPLE_TOKEN_ENCRYPTION_KEY_MISSING_MESSAGE,
    );
    expect(() => parseAppleTokenEncryptionKey('')).toThrow(
      APPLE_TOKEN_ENCRYPTION_KEY_MISSING_MESSAGE,
    );
  });

  it('rejeita Base64 que não decodifica para 32 bytes', () => {
    expect(() => parseAppleTokenEncryptionKey('dGVzdA==')).toThrow(
      APPLE_TOKEN_ENCRYPTION_KEY_INVALID_MESSAGE,
    );
    expect(() => parseAppleTokenEncryptionKey('%%%not-base64%%%')).toThrow(
      APPLE_TOKEN_ENCRYPTION_KEY_INVALID_MESSAGE,
    );
    expect(() =>
      parseAppleTokenEncryptionKey(Buffer.alloc(31, 1).toString('base64')),
    ).toThrow(APPLE_TOKEN_ENCRYPTION_KEY_INVALID_MESSAGE);
    expect(() =>
      parseAppleTokenEncryptionKey(Buffer.alloc(33, 1).toString('base64')),
    ).toThrow(APPLE_TOKEN_ENCRYPTION_KEY_INVALID_MESSAGE);
  });

  it('não ecoa a chave inválida no erro', () => {
    const leaked = 'this-is-not-a-valid-apple-key-value!!!!';
    try {
      parseAppleTokenEncryptionKey(leaked);
      throw new Error('expected throw');
    } catch (error) {
      expect(String(error)).not.toContain(leaked);
      expect(JSON.stringify(error)).not.toContain(leaked);
    }
  });

  it('cifra e decifra o refresh token com a chave de 32 bytes', () => {
    const enc = encryptAppleRefreshToken(token, TEST_KEY);
    expect(enc.startsWith('v1.')).toBe(true);
    expect(enc).not.toContain(token);
    expect(decryptAppleRefreshToken(enc, TEST_KEY)).toBe(token);
  });

  it('cada cifragem usa IV distinto', () => {
    const a = encryptAppleRefreshToken(token, TEST_KEY);
    const b = encryptAppleRefreshToken(token, TEST_KEY);
    expect(a).not.toBe(b);
    expect(decryptAppleRefreshToken(a, TEST_KEY)).toBe(token);
    expect(decryptAppleRefreshToken(b, TEST_KEY)).toBe(token);
  });

  it('chave diferente ou payload inválido retorna null', () => {
    const enc = encryptAppleRefreshToken(token, TEST_KEY);
    expect(decryptAppleRefreshToken(enc, OTHER_KEY)).toBeNull();
    expect(decryptAppleRefreshToken('not-a-payload', TEST_KEY)).toBeNull();
    expect(decryptAppleRefreshToken(null, TEST_KEY)).toBeNull();
  });

  it('não usa JWT_SECRET: string de senha JWT não é chave AES válida', () => {
    expect(() => parseAppleTokenEncryptionKey('test-secret')).toThrow(
      APPLE_TOKEN_ENCRYPTION_KEY_INVALID_MESSAGE,
    );
    expect(() =>
      encryptAppleRefreshToken(token, Buffer.from('test-secret')),
    ).toThrow(APPLE_TOKEN_ENCRYPTION_KEY_INVALID_MESSAGE);
  });
});
