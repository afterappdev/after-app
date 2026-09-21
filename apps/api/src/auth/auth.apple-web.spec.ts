import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import appleSignin from 'apple-signin-auth';
import { AuthService } from './auth.service';
import { decryptAppleRefreshToken } from './apple-token.crypto';
import {
  APPLE_WEB_EXCHANGE_TTL_MS,
  APPLE_WEB_STATE_TTL_MS,
  OAuthEphemeralStore,
} from './oauth-ephemeral.store';

jest.mock('apple-signin-auth', () => ({
  __esModule: true,
  default: {
    verifyIdToken: jest.fn(),
    getClientSecret: jest.fn(() => 'hdr.pay.sig'),
    getAuthorizationToken: jest.fn(),
  },
}));

const mockedApple = appleSignin as jest.Mocked<typeof appleSignin>;

const BUNDLE_ID = 'com.r2p.after.afterApp';
const SERVICE_ID = 'com.r2p.after.web';
const APP = 'https://app-after.com.br';
const API = 'https://after-app-production.up.railway.app';
const CALLBACK = `${API}/auth/apple/web/callback`;
const PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----';

function config(map: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => map[key] } as unknown as ConfigService;
}

function createPrisma() {
  const prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    socialOnboardingToken: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    socialOnboardingToken: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof prisma) => unknown)(prisma);
    }
    return arg;
  });
  return prisma;
}

const EXISTING = {
  id: 'u-apple',
  name: 'Ada Lovelace',
  email: 'hidden@privaterelay.appleid.com',
  role: Role.USER,
  state: 'SP',
  city: 'São Paulo',
  avatarUrl: null,
  venue: null,
};

describe('AuthService Apple Web', () => {
  const originalEnv = { ...process.env };
  let now: number;
  let store: OAuthEphemeralStore;
  let prisma: ReturnType<typeof createPrisma>;
  let service: AuthService;
  let jwt: JwtService;

  const env = {
    JWT_SECRET: 'test-secret',
    APPLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    APPLE_BUNDLE_ID: BUNDLE_ID,
    APPLE_SERVICE_ID: SERVICE_ID,
    APPLE_TEAM_ID: 'TEAMID1234',
    APPLE_KEY_ID: 'KEYID12345',
    APPLE_PRIVATE_KEY: PRIVATE_KEY,
    PUBLIC_API_URL: API,
    PUBLIC_APP_URL: APP,
    OAUTH_REDIRECT_ORIGINS: APP,
  };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    now = 1_000_000;
    store = new OAuthEphemeralStore();
    store.setNowForTests(() => now);
    prisma = createPrisma();
    jwt = new JwtService({ secret: 'test-secret' });
    service = new AuthService(
      prisma as never,
      jwt,
      config(env),
      undefined,
      store,
    );
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.socialOnboardingToken.findFirst.mockResolvedValue(null);
    prisma.socialOnboardingToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.socialOnboardingToken.create.mockResolvedValue({
      id: 'jti-1',
      provider: 'apple',
      providerId: 'apple-sub-1',
      email: 'hidden@privaterelay.appleid.com',
      name: 'Ada Lovelace',
      avatarUrl: null,
    });
    mockedApple.verifyIdToken.mockReset();
    mockedApple.getAuthorizationToken.mockReset();
    mockedApple.getClientSecret.mockReset();
    mockedApple.getClientSecret.mockReturnValue('hdr.pay.sig');
    mockedApple.getAuthorizationToken.mockResolvedValue({
      id_token: 'exchanged-id-token',
      access_token: 'apple-access',
      refresh_token: 'apple-refresh',
      token_type: 'Bearer',
      expires_in: 3600,
    });
    mockedApple.verifyIdToken.mockImplementation(async (_token, opts: { audience?: string; nonce?: string; issuer?: string }) => {
      if (opts.issuer && opts.issuer !== 'https://appleid.apple.com') {
        throw new Error('invalid issuer');
      }
      if (opts.audience !== BUNDLE_ID && opts.audience !== SERVICE_ID) {
        throw new Error('invalid audience');
      }
      return {
        sub: 'apple-sub-1',
        email: 'hidden@privaterelay.appleid.com',
        aud: opts.audience,
        iss: 'https://appleid.apple.com',
        nonce: opts.nonce,
      };
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function startAndParse(redirect = `${APP}/`) {
    const url = new URL(service.appleStartUrl(redirect));
    return {
      url,
      state: url.searchParams.get('state') ?? '',
      nonce: url.searchParams.get('nonce') ?? '',
    };
  }

  it('1. iOS audience continua aceita somente com o Bundle ID', async () => {
    prisma.user.findUnique.mockResolvedValue(EXISTING);
    await service.loginWithApple({
      identityToken: 'a'.repeat(24),
    });
    expect(mockedApple.verifyIdToken).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        audience: BUNDLE_ID,
        issuer: 'https://appleid.apple.com',
      }),
    );
    const opts = mockedApple.verifyIdToken.mock.calls[0][1] as {
      audience: string;
      nonce?: string;
    };
    expect(opts.audience).toBe(BUNDLE_ID);
    expect(opts.nonce).toBeUndefined();
  });

  it('2. Web audience aceita somente no fluxo Web', async () => {
    const { state, nonce } = startAndParse();
    const target = await service.appleWebCallback({
      code: 'auth-code-1',
      id_token: 'form-id-token',
      state,
    });
    const webCall = mockedApple.verifyIdToken.mock.calls.find(
      (call) => (call[1] as { audience?: string }).audience === SERVICE_ID,
    );
    expect(webCall).toBeTruthy();
    expect(webCall?.[1]).toEqual(
      expect.objectContaining({
        audience: SERVICE_ID,
        issuer: 'https://appleid.apple.com',
        nonce,
      }),
    );
    expect(target).toContain('/#/auth/apple/callback?code=');
    expect(target).not.toContain('token=');
  });

  it('3. audience inválida é rejeitada', async () => {
    mockedApple.verifyIdToken.mockRejectedValueOnce(new Error('invalid audience'));
    await expect(
      service.loginWithApple({ identityToken: 'a'.repeat(24) }),
    ).rejects.toThrow('Token da Apple inválido.');
  });

  it('4. issuer inválido é rejeitado', async () => {
    mockedApple.verifyIdToken.mockRejectedValueOnce(new Error('invalid issuer'));
    await expect(
      service.loginWithApple({ identityToken: 'a'.repeat(24) }),
    ).rejects.toThrow('Token da Apple inválido.');
  });

  it('5. token expirado é rejeitado', async () => {
    mockedApple.verifyIdToken.mockRejectedValueOnce(
      Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }),
    );
    await expect(
      service.loginWithApple({ identityToken: 'a'.repeat(24) }),
    ).rejects.toThrow('Token da Apple inválido.');
  });

  it('6. state válido é aceito', async () => {
    const { state } = startAndParse();
    const target = await service.appleWebCallback({
      code: 'auth-code-1',
      state,
    });
    expect(target.startsWith(`${APP}/#/auth/apple/callback?code=`)).toBe(true);
  });

  it('7. state inválido é rejeitado sem 500', async () => {
    const target = await service.appleWebCallback({
      code: 'auth-code-1',
      state: 'unknown-state',
    });
    expect(target).toBe(`${APP}/#/login?apple=error`);
    expect(mockedApple.getAuthorizationToken).not.toHaveBeenCalled();
  });

  it('8. state expirado é rejeitado', async () => {
    const { state } = startAndParse();
    now += APPLE_WEB_STATE_TTL_MS + 1;
    const target = await service.appleWebCallback({
      code: 'auth-code-1',
      state,
    });
    expect(target).toBe(`${APP}/#/login?apple=error`);
  });

  it('9. state reutilizado é rejeitado', async () => {
    const { state } = startAndParse();
    await service.appleWebCallback({ code: 'auth-code-1', state });
    const target = await service.appleWebCallback({
      code: 'auth-code-2',
      state,
    });
    expect(target).toBe(`${APP}/#/login?apple=error`);
  });

  it('10. nonce correto é enviado à verificação', async () => {
    const { state, nonce } = startAndParse();
    await service.appleWebCallback({ code: 'auth-code-1', state });
    expect(mockedApple.verifyIdToken).toHaveBeenCalledWith(
      'exchanged-id-token',
      expect.objectContaining({ nonce, audience: SERVICE_ID }),
    );
  });

  it('11. nonce incorreto é rejeitado', async () => {
    const { state } = startAndParse();
    mockedApple.verifyIdToken.mockRejectedValueOnce(new Error('bad nonce'));
    const target = await service.appleWebCallback({
      code: 'auth-code-1',
      state,
    });
    expect(target).toBe(`${APP}/#/login?apple=error`);
  });

  it('12. callback cancelado volta ao After Web', async () => {
    const { state } = startAndParse();
    const target = await service.appleWebCallback({
      error: 'user_cancelled_authorize',
      state,
    });
    expect(target).toBe(`${APP}/#/login?apple=canceled`);
    expect(mockedApple.getAuthorizationToken).not.toHaveBeenCalled();
  });

  it('13. troca o authorization code com a Apple (mock)', async () => {
    const { state } = startAndParse();
    await service.appleWebCallback({ code: 'auth-code-1', state });
    expect(mockedApple.getAuthorizationToken).toHaveBeenCalledWith(
      'auth-code-1',
      expect.objectContaining({
        clientID: SERVICE_ID,
        redirectUri: CALLBACK,
        clientSecret: 'hdr.pay.sig',
      }),
    );
  });

  it('start usa client_id, scopes, form_post e Return URL exata', () => {
    const { url } = startAndParse();
    expect(url.origin).toBe('https://appleid.apple.com');
    expect(url.searchParams.get('client_id')).toBe(SERVICE_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK);
    expect(url.searchParams.get('response_mode')).toBe('form_post');
    expect(url.searchParams.get('scope')).toBe('name email');
    expect(url.searchParams.get('response_type')).toBe('code id_token');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('nonce')).toBeTruthy();
  });

  it('17-18. login exchange code é single-use e expira', async () => {
    const { state } = startAndParse();
    const target = await service.appleWebCallback({
      code: 'auth-code-1',
      state,
    });
    const code = new URL(target.replace('/#/', '/')).searchParams.get('code');
    expect(code).toBeTruthy();
    const first = await service.exchangeAppleWebLogin(code!);
    expect(first).toHaveProperty('needsRegistration', true);
    await expect(service.exchangeAppleWebLogin(code!)).rejects.toThrow(
      'Código de login Apple expirado ou inválido.',
    );

    const again = startAndParse();
    const target2 = await service.appleWebCallback({
      code: 'auth-code-2',
      state: again.state,
    });
    const code2 = new URL(target2.replace('/#/', '/')).searchParams.get('code');
    now += APPLE_WEB_EXCHANGE_TTL_MS + 1;
    await expect(service.exchangeAppleWebLogin(code2!)).rejects.toThrow(
      'Código de login Apple expirado ou inválido.',
    );
  });

  it('19. token After não aparece na URL', async () => {
    prisma.user.findUnique.mockImplementation(async (args: { where: { appleId?: string } }) =>
      args.where.appleId === 'apple-sub-1' ? EXISTING : null,
    );
    const { state } = startAndParse();
    const target = await service.appleWebCallback({
      code: 'auth-code-1',
      state,
    });
    expect(target).not.toMatch(/accessToken/i);
    expect(target).not.toContain('token=');
    const code = new URL(target.replace('/#/', '/')).searchParams.get('code');
    const session = await service.exchangeAppleWebLogin(code!);
    expect(session).toHaveProperty('accessToken');
    expect(typeof (session as { accessToken?: string }).accessToken).toBe(
      'string',
    );
  });

  it('20. usuário existente não é duplicado', async () => {
    prisma.user.findUnique.mockImplementation(async (args: { where: { appleId?: string } }) =>
      args.where.appleId === 'apple-sub-1' ? EXISTING : null,
    );
    const { state } = startAndParse();
    const target = await service.appleWebCallback({
      code: 'auth-code-1',
      state,
    });
    const code = new URL(target.replace('/#/', '/')).searchParams.get('code');
    const session = await service.exchangeAppleWebLogin(code!);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-apple' },
      data: expect.objectContaining({
        appleClientId: SERVICE_ID,
        appleRefreshTokenEnc: expect.stringMatching(/^v1\./),
      }),
    });
    const stored = prisma.user.update.mock.calls[0][0].data;
    expect(JSON.stringify(stored)).not.toContain('apple-refresh');
    expect(JSON.stringify(stored)).not.toContain(env.JWT_SECRET);
    expect(
      decryptAppleRefreshToken(
        stored.appleRefreshTokenEnc,
        Buffer.alloc(32, 9),
      ),
    ).toBe('apple-refresh');
    expect(session).toMatchObject({
      user: { id: 'u-apple', name: 'Ada Lovelace' },
    });
  });

  it('21. nome existente não é apagado quando Apple não devolve user', async () => {
    prisma.user.findUnique.mockImplementation(async (args: { where: { appleId?: string } }) =>
      args.where.appleId === 'apple-sub-1' ? EXISTING : null,
    );
    const { state } = startAndParse();
    await service.appleWebCallback({
      code: 'auth-code-1',
      state,
    });
    const stored = prisma.user.update.mock.calls[0][0].data;
    expect(stored.name).toBeUndefined();
    expect(stored.appleClientId).toBe(SERVICE_ID);
  });

  it('sem APPLE_PRIVATE_KEY o Apple Web falha de forma controlada', () => {
    const limited = new AuthService(
      prisma as never,
      jwt,
      config({
        ...env,
        APPLE_PRIVATE_KEY: '',
      }),
      undefined,
      store,
    );
    expect(limited.providers()).toMatchObject({
      apple: true,
      appleBrowser: false,
    });
    expect(() => limited.appleStartUrl(`${APP}/`)).toThrow(
      ServiceUnavailableException,
    );
  });

  it('não aceita returnUrl arbitrário no start', () => {
    expect(() => service.appleStartUrl('https://evil.example/')).toThrow(
      'Redirect OAuth não permitido.',
    );
  });

  it('login nativo com authorizationCode persiste token revogável', async () => {
    const appleTokens = {
      exchangeNativeCode: jest.fn().mockResolvedValue({
        refreshToken: 'native-refresh',
        clientId: BUNDLE_ID,
      }),
      storedFromRevocable: jest.fn((creds?: { refreshToken: string; clientId: string }) =>
        creds
          ? {
              appleRefreshTokenEnc: 'v1.enc',
              appleClientId: creds.clientId,
            }
          : undefined,
      ),
    };
    const native = new AuthService(
      prisma as never,
      jwt,
      config(env),
      undefined,
      store,
      appleTokens as never,
    );
    prisma.user.findUnique.mockResolvedValue(EXISTING);
    await native.loginWithApple({
      identityToken: 'a'.repeat(24),
      authorizationCode: 'native-code',
    });
    expect(appleTokens.exchangeNativeCode).toHaveBeenCalledWith('native-code');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-apple' },
      data: {
        appleRefreshTokenEnc: 'v1.enc',
        appleClientId: BUNDLE_ID,
      },
    });
  });

  it('falha ao trocar authorizationCode nativo não quebra o login', async () => {
    const appleTokens = {
      exchangeNativeCode: jest.fn().mockResolvedValue(undefined),
      storedFromRevocable: jest.fn().mockReturnValue(undefined),
    };
    const native = new AuthService(
      prisma as never,
      jwt,
      config(env),
      undefined,
      store,
      appleTokens as never,
    );
    prisma.user.findUnique.mockResolvedValue(EXISTING);
    const result = await native.loginWithApple({
      identityToken: 'a'.repeat(24),
      authorizationCode: 'bad-code',
    });
    expect(result).toHaveProperty('accessToken');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('novo login Apple Web guarda refresh token cifrado no onboarding', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const { state } = startAndParse();
    await service.appleWebCallback({
      code: 'auth-code-1',
      state,
    });
    const created = prisma.socialOnboardingToken.create.mock.calls[0][0];
    expect(created.data.appleClientId).toBe(SERVICE_ID);
    expect(created.data.appleRefreshTokenEnc).toMatch(/^v1\./);
    expect(JSON.stringify(created)).not.toContain('apple-refresh');
  });
});
