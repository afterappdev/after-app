import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import appleSignin from 'apple-signin-auth';
import {
  APPLE_REVOKE_UNAVAILABLE_MESSAGE,
  AppleAuthTokensService,
  classifyAppleRevokeError,
} from './apple-auth-tokens.service';
import {
  APPLE_TOKEN_ENCRYPTION_KEY_BYTES,
  APPLE_TOKEN_ENCRYPTION_KEY_MISSING_MESSAGE,
  AppleTokenEncryptionKeyError,
  encryptAppleRefreshToken,
} from './apple-token.crypto';

jest.mock('apple-signin-auth', () => ({
  __esModule: true,
  default: {
    getClientSecret: jest.fn(() => 'hdr.pay.sig'),
    revokeAuthorizationToken: jest.fn(),
    getAuthorizationToken: jest.fn(),
  },
}));

const mockedApple = appleSignin as jest.Mocked<typeof appleSignin>;

function config(map: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => map[key] } as unknown as ConfigService;
}

const TEST_APPLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(
  APPLE_TOKEN_ENCRYPTION_KEY_BYTES,
  9,
).toString('base64');

const TEST_KEY = Buffer.alloc(APPLE_TOKEN_ENCRYPTION_KEY_BYTES, 9);

const ENV = {
  JWT_SECRET: 'test-secret-must-not-encrypt-apple-tokens',
  APPLE_TOKEN_ENCRYPTION_KEY: TEST_APPLE_TOKEN_ENCRYPTION_KEY,
  APPLE_BUNDLE_ID: 'com.r2p.after.afterApp',
  APPLE_TEAM_ID: 'TEAMID1234',
  APPLE_KEY_ID: 'KEYID12345',
  APPLE_PRIVATE_KEY:
    '-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----',
};

describe('AppleAuthTokensService', () => {
  let service: AppleAuthTokensService;

  beforeEach(() => {
    service = new AppleAuthTokensService(config(ENV));
    mockedApple.revokeAuthorizationToken.mockReset();
    mockedApple.revokeAuthorizationToken.mockResolvedValue({});
    mockedApple.getClientSecret.mockClear();
    mockedApple.getClientSecret.mockReturnValue('hdr.pay.sig');
  });

  it('exige APPLE_TOKEN_ENCRYPTION_KEY na inicialização quando Apple está configurado', () => {
    const missing = new AppleAuthTokensService(
      config({
        ...ENV,
        APPLE_TOKEN_ENCRYPTION_KEY: undefined,
      }),
    );
    expect(() => missing.onModuleInit()).toThrow(AppleTokenEncryptionKeyError);
    expect(() => missing.onModuleInit()).toThrow(
      APPLE_TOKEN_ENCRYPTION_KEY_MISSING_MESSAGE,
    );
  });

  it('não exige a chave de cifra se Apple server-side não está configurado', () => {
    const limited = new AppleAuthTokensService(
      config({
        JWT_SECRET: ENV.JWT_SECRET,
        APPLE_BUNDLE_ID: ENV.APPLE_BUNDLE_ID,
      }),
    );
    expect(() => limited.onModuleInit()).not.toThrow();
  });

  it('rejeita chave Base64 com tamanho diferente de 32 bytes', () => {
    const invalid = new AppleAuthTokensService(
      config({
        ...ENV,
        APPLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString('base64'),
      }),
    );
    expect(() => invalid.onModuleInit()).toThrow(AppleTokenEncryptionKeyError);
  });

  it('inicializa com chave de teste de 32 bytes', () => {
    expect(() => service.onModuleInit()).not.toThrow();
  });

  it('revoga o refresh token armazenado', async () => {
    const enc = encryptAppleRefreshToken('apple-refresh', TEST_KEY);
    await service.revokeForAccount({
      appleId: 'apple-sub-1',
      appleRefreshTokenEnc: enc,
      appleClientId: ENV.APPLE_BUNDLE_ID,
    });
    expect(mockedApple.revokeAuthorizationToken).toHaveBeenCalledWith(
      'apple-refresh',
      expect.objectContaining({
        clientID: ENV.APPLE_BUNDLE_ID,
        tokenTypeHint: 'refresh_token',
      }),
    );
    const args = mockedApple.revokeAuthorizationToken.mock.calls[0];
    expect(JSON.stringify(args[1])).not.toContain('apple-refresh');
    expect(JSON.stringify(args[1])).not.toContain(
      TEST_APPLE_TOKEN_ENCRYPTION_KEY,
    );
  });

  it('JWT_SECRET não descriptografa o ciphertext Apple', async () => {
    const jwtAsKey = Buffer.from(ENV.JWT_SECRET);
    expect(jwtAsKey.length).not.toBe(32);
    const enc = encryptAppleRefreshToken('apple-refresh', TEST_KEY);
    expect(() => encryptAppleRefreshToken('apple-refresh', jwtAsKey)).toThrow(
      AppleTokenEncryptionKeyError,
    );
    await service.revokeForAccount({
      appleId: 'apple-sub-1',
      appleRefreshTokenEnc: enc,
      appleClientId: ENV.APPLE_BUNDLE_ID,
    });
    expect(mockedApple.revokeAuthorizationToken).toHaveBeenCalledWith(
      'apple-refresh',
      expect.any(Object),
    );
  });

  it('conta Apple antiga sem token segue a exclusão', async () => {
    await service.revokeForAccount({
      appleId: 'apple-sub-legacy',
      appleRefreshTokenEnc: null,
      appleClientId: null,
    });
    expect(mockedApple.revokeAuthorizationToken).not.toHaveBeenCalled();
  });

  it('token já inválido na Apple não bloqueia a exclusão', async () => {
    mockedApple.revokeAuthorizationToken.mockRejectedValueOnce({
      error: 'invalid_grant',
      status: 400,
    });
    const enc = encryptAppleRefreshToken('stale-refresh', TEST_KEY);
    await expect(
      service.revokeForAccount({
        appleId: 'apple-sub-1',
        appleRefreshTokenEnc: enc,
        appleClientId: ENV.APPLE_BUNDLE_ID,
      }),
    ).resolves.toBeUndefined();
  });

  it('falha temporária da Apple aborta a exclusão', async () => {
    mockedApple.revokeAuthorizationToken.mockRejectedValue({
      status: 503,
      message: 'refresh_token=should-not-leak',
    });
    const enc = encryptAppleRefreshToken('apple-refresh', TEST_KEY);
    await expect(
      service.revokeForAccount({
        appleId: 'apple-sub-1',
        appleRefreshTokenEnc: enc,
        appleClientId: ENV.APPLE_BUNDLE_ID,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.revokeForAccount({
        appleId: 'apple-sub-1',
        appleRefreshTokenEnc: enc,
        appleClientId: ENV.APPLE_BUNDLE_ID,
      }),
    ).rejects.toThrow(APPLE_REVOKE_UNAVAILABLE_MESSAGE);
  });

  it('não inclui o refresh token nem a chave na mensagem de erro HTTP', async () => {
    mockedApple.revokeAuthorizationToken.mockRejectedValueOnce({
      status: 500,
      message: 'refresh_token=apple-refresh',
    });
    const enc = encryptAppleRefreshToken('apple-refresh', TEST_KEY);
    try {
      await service.revokeForAccount({
        appleId: 'apple-sub-1',
        appleRefreshTokenEnc: enc,
        appleClientId: ENV.APPLE_BUNDLE_ID,
      });
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(JSON.stringify(error)).not.toContain('apple-refresh');
      expect(JSON.stringify(error)).not.toContain(
        TEST_APPLE_TOKEN_ENCRYPTION_KEY,
      );
      expect((error as ServiceUnavailableException).message).toBe(
        APPLE_REVOKE_UNAVAILABLE_MESSAGE,
      );
    }
  });

  it('classifica invalid_client como config (não bloqueia)', () => {
    expect(
      classifyAppleRevokeError({ error: 'invalid_client', status: 400 }),
    ).toBe('config');
  });
});
