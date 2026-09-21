import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export const APPLE_TOKEN_ENCRYPTION_KEY_BYTES = 32;
export const APPLE_TOKEN_ENCRYPTION_KEY_ENV = 'APPLE_TOKEN_ENCRYPTION_KEY';

const CIPHER_PREFIX = 'v1';
const BASE64_32_BYTES = /^[A-Za-z0-9+/]+={0,2}$/;

export const APPLE_TOKEN_ENCRYPTION_KEY_MISSING_MESSAGE =
  'APPLE_TOKEN_ENCRYPTION_KEY is required when Sign in with Apple is configured. It must be a Base64 encoding of exactly 32 random bytes.';

export const APPLE_TOKEN_ENCRYPTION_KEY_INVALID_MESSAGE =
  'APPLE_TOKEN_ENCRYPTION_KEY is invalid. Provide a Base64 encoding of exactly 32 bytes (AES-256).';

export class AppleTokenEncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppleTokenEncryptionKeyError';
  }
}

export function parseAppleTokenEncryptionKey(
  raw: string | null | undefined,
): Buffer {
  const normalized = unwrapEnv(raw);
  if (!normalized) {
    throw new AppleTokenEncryptionKeyError(
      APPLE_TOKEN_ENCRYPTION_KEY_MISSING_MESSAGE,
    );
  }
  if (!BASE64_32_BYTES.test(normalized)) {
    throw new AppleTokenEncryptionKeyError(
      APPLE_TOKEN_ENCRYPTION_KEY_INVALID_MESSAGE,
    );
  }
  const key = Buffer.from(normalized, 'base64');
  if (key.length !== APPLE_TOKEN_ENCRYPTION_KEY_BYTES) {
    throw new AppleTokenEncryptionKeyError(
      APPLE_TOKEN_ENCRYPTION_KEY_INVALID_MESSAGE,
    );
  }
  return key;
}

export function encryptAppleRefreshToken(token: string, key: Buffer): string {
  const aesKey = requireAes256Key(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    CIPHER_PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptAppleRefreshToken(
  payload: string | null | undefined,
  key: Buffer,
): string | null {
  if (!payload) return null;
  try {
    const aesKey = requireAes256Key(key);
    const [prefix, ivB64, tagB64, dataB64] = payload.split('.');
    if (prefix !== CIPHER_PREFIX || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      aesKey,
      Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

function requireAes256Key(key: Buffer): Buffer {
  if (!Buffer.isBuffer(key) || key.length !== APPLE_TOKEN_ENCRYPTION_KEY_BYTES) {
    throw new AppleTokenEncryptionKeyError(
      APPLE_TOKEN_ENCRYPTION_KEY_INVALID_MESSAGE,
    );
  }
  return key;
}

function unwrapEnv(raw: string | null | undefined): string {
  if (!raw) return '';
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value.replace(/\s+/g, '');
}
