import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuthService } from './auth.service';
import { CompleteSocialRegistrationDto } from './dto/complete-social-registration.dto';
import { JwtStrategy } from './jwt.strategy';
import {
  SOCIAL_ONBOARDING_EXPIRED_MESSAGE,
  SOCIAL_ONBOARDING_INVALID_MESSAGE,
  SOCIAL_ONBOARDING_TYP,
  SOCIAL_ONBOARDING_USED_MESSAGE,
} from './social-onboarding';

function config(map: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => map[key],
  } as unknown as ConfigService;
}

function createPrisma() {
  const prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
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
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  });
  return prisma;
}

const EXISTING_USER = {
  id: 'u-existing',
  name: 'Ana',
  email: 'ana@after.local',
  role: Role.USER,
  state: 'SP',
  city: 'São Paulo',
  avatarUrl: null,
  venue: null,
};

describe('AuthService social onboarding', () => {
  const originalEnv = { ...process.env };
  let service: AuthService;
  let prisma: ReturnType<typeof createPrisma>;
  let jwt: JwtService;
  let nextOnboardingId = 1;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    nextOnboardingId = 1;
    prisma = createPrisma();
    jwt = new JwtService({ secret: 'test-secret' });
    service = new AuthService(
      prisma as never,
      jwt,
      config({
        JWT_SECRET: 'test-secret',
        GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com',
        APPLE_BUNDLE_ID: 'br.com.after.app',
      }),
    );
    prisma.socialOnboardingToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.socialOnboardingToken.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: `jti-${nextOnboardingId++}`,
      ...args.data,
      usedAt: null,
    }));
    prisma.socialOnboardingToken.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function googleNew(overrides: Record<string, unknown> = {}) {
    jest.spyOn(service as never, 'verifyGoogleIdToken').mockResolvedValue({
      sub: 'gid-new',
      email: 'nova@gmail.com',
      name: 'Nova Silva',
      picture: 'https://lh3.googleusercontent.com/a/photo',
      ...overrides,
    } as never);
    return service.loginWithGoogle({ idToken: 'google-id-token-value-ok' });
  }

  async function appleNew(overrides: Record<string, unknown> = {}) {
    jest.spyOn(service as never, 'verifyAppleIdToken').mockResolvedValue({
      sub: 'aid-new',
      email: 'hidden@privaterelay.appleid.com',
      ...overrides,
    } as never);
    return service.loginWithApple({
      identityToken: 'apple-identity-token-value-ok',
      fullName: 'Ada Lovelace',
    });
  }

  function stubConsumedOnboarding(row: {
    id: string;
    provider: string;
    providerId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    usedAt?: Date | null;
    expiresAt?: Date;
  }) {
    prisma.socialOnboardingToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.socialOnboardingToken.findUnique.mockResolvedValue({
      ...row,
      usedAt: row.usedAt ?? null,
      expiresAt: row.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
    });
  }

  it('1. Google novo NÃO cria User imediatamente', async () => {
    const result = await googleNew();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      needsRegistration: true,
      profile: {
        provider: 'google',
        email: 'nova@gmail.com',
        name: 'Nova Silva',
        avatarUrl: 'https://lh3.googleusercontent.com/a/photo',
      },
    });
    expect('accessToken' in result).toBe(false);
    expect(result.needsRegistration && result.onboardingToken).toBeTruthy();
    const payload = jwt.verify<{ typ: string; providerId: string }>(
      result.needsRegistration ? result.onboardingToken : '',
    );
    expect(payload.typ).toBe(SOCIAL_ONBOARDING_TYP);
    expect(payload.providerId).toBe('gid-new');
  });

  it('2. Apple novo NÃO cria User imediatamente', async () => {
    const result = await appleNew();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      needsRegistration: true,
      profile: {
        provider: 'apple',
        email: 'hidden@privaterelay.appleid.com',
        name: 'Ada Lovelace',
      },
    });
    expect('accessToken' in result).toBe(false);
  });

  it('3. Google existente faz login direto', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...EXISTING_USER,
      googleId: 'gid-existing',
    });
    jest.spyOn(service as never, 'verifyGoogleIdToken').mockResolvedValue({
      sub: 'gid-existing',
      email: 'ana@after.local',
      name: 'Ana',
      picture: null,
    } as never);
    const result = await service.loginWithGoogle({
      idToken: 'google-id-token-value-ok',
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.socialOnboardingToken.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      user: { id: 'u-existing', email: 'ana@after.local' },
    });
    expect('accessToken' in result && result.accessToken).toBeTruthy();
  });

  it('4. Apple existente faz login direto', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...EXISTING_USER,
      appleId: 'aid-existing',
    });
    jest.spyOn(service as never, 'verifyAppleIdToken').mockResolvedValue({
      sub: 'aid-existing',
      email: 'hidden@privaterelay.appleid.com',
    } as never);
    const result = await service.loginWithApple({
      identityToken: 'apple-identity-token-value-ok',
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect('accessToken' in result && result.accessToken).toBeTruthy();
    expect('needsRegistration' in result).toBe(false);
  });

  it('5. onboarding token válido conclui cadastro', async () => {
    const issued = await googleNew();
    if (!issued.needsRegistration) throw new Error('esperado onboarding');
    stubConsumedOnboarding({
      id: 'jti-1',
      provider: 'google',
      providerId: 'gid-new',
      email: 'nova@gmail.com',
      name: 'Nova Silva',
      avatarUrl: 'https://lh3.googleusercontent.com/a/photo',
    });
    prisma.user.create.mockResolvedValue({
      id: 'u-created',
      name: 'Nova Silva',
      email: 'nova@gmail.com',
      role: Role.USER,
      state: 'RJ',
      city: 'Niterói',
      avatarUrl: 'https://lh3.googleusercontent.com/a/photo',
      venue: null,
    });
    const result = await service.completeSocialRegistration({
      onboardingToken: issued.onboardingToken,
      accountType: 'user',
      name: 'Nova Silva',
      state: 'RJ',
      city: 'Niterói',
    });
    expect(result.user.id).toBe('u-created');
    expect(result.accessToken).toBeTruthy();
  });

  it('6. token expirado é rejeitado', async () => {
    const token = jwt.sign(
      {
        typ: SOCIAL_ONBOARDING_TYP,
        provider: 'google',
        providerId: 'gid-new',
        email: 'nova@gmail.com',
        name: 'Nova',
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      { jwtid: 'jti-expired' },
    );
    await expect(
      service.completeSocialRegistration({
        onboardingToken: token,
        accountType: 'user',
        name: 'Nova',
        state: 'SP',
        city: 'São Paulo',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.completeSocialRegistration({
        onboardingToken: token,
        accountType: 'user',
        name: 'Nova',
        state: 'SP',
        city: 'São Paulo',
      }),
    ).rejects.toThrow(SOCIAL_ONBOARDING_EXPIRED_MESSAGE);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('7. token inválido é rejeitado', async () => {
    await expect(
      service.completeSocialRegistration({
        onboardingToken: 'not-a-jwt-token-at-all-here',
        accountType: 'user',
        name: 'Nova',
        state: 'SP',
        city: 'São Paulo',
      }),
    ).rejects.toThrow(SOCIAL_ONBOARDING_INVALID_MESSAGE);

    const session = jwt.sign({
      sub: 'u1',
      email: 'ana@after.local',
      role: Role.USER,
    });
    await expect(
      service.completeSocialRegistration({
        onboardingToken: session,
        accountType: 'user',
        name: 'Nova',
        state: 'SP',
        city: 'São Paulo',
      }),
    ).rejects.toThrow(SOCIAL_ONBOARDING_INVALID_MESSAGE);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('8. token reutilizado é rejeitado', async () => {
    const issued = await googleNew();
    if (!issued.needsRegistration) throw new Error('esperado onboarding');
    prisma.socialOnboardingToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.socialOnboardingToken.findUnique.mockResolvedValue({
      id: 'jti-1',
      provider: 'google',
      providerId: 'gid-new',
      email: 'nova@gmail.com',
      name: 'Nova Silva',
      avatarUrl: null,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await expect(
      service.completeSocialRegistration({
        onboardingToken: issued.onboardingToken,
        accountType: 'user',
        name: 'Nova Silva',
        state: 'SP',
        city: 'São Paulo',
      }),
    ).rejects.toThrow(SOCIAL_ONBOARDING_USED_MESSAGE);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('9. accountType user cria usuário correto', async () => {
    const issued = await googleNew();
    if (!issued.needsRegistration) throw new Error('esperado onboarding');
    stubConsumedOnboarding({
      id: 'jti-1',
      provider: 'google',
      providerId: 'gid-new',
      email: 'nova@gmail.com',
      name: 'Nova Silva',
      avatarUrl: null,
    });
    prisma.user.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'u-user',
      venue: null,
      ...args.data,
    }));
    const result = await service.completeSocialRegistration({
      onboardingToken: issued.onboardingToken,
      accountType: 'user',
      name: 'Nome Editado',
      state: 'MG',
      city: 'Belo Horizonte',
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: Role.USER,
          name: 'Nome Editado',
          email: 'nova@gmail.com',
          googleId: 'gid-new',
          state: 'MG',
          city: 'Belo Horizonte',
        }),
      }),
    );
    expect(prisma.user.create.mock.calls[0][0].data.venue).toBeUndefined();
    expect(result.user.role).toBe(Role.USER);
  });

  it('10. accountType venue cria owner + venue corretamente', async () => {
    const issued = await appleNew();
    if (!issued.needsRegistration) throw new Error('esperado onboarding');
    stubConsumedOnboarding({
      id: 'jti-1',
      provider: 'apple',
      providerId: 'aid-new',
      email: 'hidden@privaterelay.appleid.com',
      name: 'Ada Lovelace',
      avatarUrl: null,
    });
    prisma.user.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'u-venue',
      ...args.data,
      venue: { id: 'v1' },
    }));
    const result = await service.completeSocialRegistration({
      onboardingToken: issued.onboardingToken,
      accountType: 'venue',
      name: 'Bar da Ada',
      state: 'SP',
      city: 'São Paulo',
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: Role.VENUE,
          appleId: 'aid-new',
          email: 'hidden@privaterelay.appleid.com',
          venue: expect.objectContaining({
            create: expect.objectContaining({
              name: 'Bar da Ada',
              city: 'São Paulo',
              state: 'SP',
            }),
          }),
        }),
      }),
    );
    expect(result.user.venueId).toBe('v1');
  });

  it('11. provider id é preservado', async () => {
    const issued = await googleNew();
    if (!issued.needsRegistration) throw new Error('esperado onboarding');
    stubConsumedOnboarding({
      id: 'jti-1',
      provider: 'google',
      providerId: 'gid-new',
      email: 'nova@gmail.com',
      name: 'Nova Silva',
      avatarUrl: null,
    });
    prisma.user.create.mockResolvedValue({
      ...EXISTING_USER,
      id: 'u-created',
      email: 'nova@gmail.com',
    });
    await service.completeSocialRegistration({
      onboardingToken: issued.onboardingToken,
      accountType: 'user',
      name: 'Nova Silva',
      state: 'SP',
      city: 'São Paulo',
    });
    expect(prisma.user.create.mock.calls[0][0].data.googleId).toBe('gid-new');
    expect(prisma.user.create.mock.calls[0][0].data.appleId).toBeUndefined();
  });

  it('12. e-mail do token não pode ser alterado pelo frontend', async () => {
    const issued = await googleNew();
    if (!issued.needsRegistration) throw new Error('esperado onboarding');
    stubConsumedOnboarding({
      id: 'jti-1',
      provider: 'google',
      providerId: 'gid-new',
      email: 'nova@gmail.com',
      name: 'Nova Silva',
      avatarUrl: null,
    });
    prisma.user.create.mockResolvedValue({
      ...EXISTING_USER,
      id: 'u-created',
      email: 'nova@gmail.com',
    });
    await service.completeSocialRegistration({
      onboardingToken: issued.onboardingToken,
      accountType: 'user',
      name: 'Nova Silva',
      state: 'SP',
      city: 'São Paulo',
      email: 'hacker@evil.com',
    } as CompleteSocialRegistrationDto & { email: string });
    expect(prisma.user.create.mock.calls[0][0].data.email).toBe('nova@gmail.com');
  });

  it('13. duas conclusões simultâneas não duplicam conta', async () => {
    const issued = await googleNew();
    if (!issued.needsRegistration) throw new Error('esperado onboarding');
    let usedAt: Date | null = null;
    prisma.socialOnboardingToken.updateMany.mockImplementation(async () => {
      if (usedAt) return { count: 0 };
      usedAt = new Date();
      return { count: 1 };
    });
    prisma.socialOnboardingToken.findUnique.mockImplementation(async () => ({
      id: 'jti-1',
      provider: 'google',
      providerId: 'gid-new',
      email: 'nova@gmail.com',
      name: 'Nova Silva',
      avatarUrl: null,
      usedAt,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    }));
    prisma.user.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'u-once',
      venue: null,
      ...args.data,
    }));

    const dto = {
      onboardingToken: issued.onboardingToken,
      accountType: 'user' as const,
      name: 'Nova Silva',
      state: 'SP',
      city: 'São Paulo',
    };
    const settled = await Promise.allSettled([
      service.completeSocialRegistration(dto),
      service.completeSocialRegistration(dto),
    ]);
    const ok = settled.filter((s) => s.status === 'fulfilled');
    const failed = settled.filter((s) => s.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('14. fluxo e-mail/senha existente não quebra', async () => {
    const passwordHash = await bcrypt.hash('senha123', 10);
    prisma.user.findUnique.mockResolvedValue({
      ...EXISTING_USER,
      passwordHash,
    });
    const result = await service.login({
      email: 'ana@after.local',
      password: 'senha123',
    });
    expect(result.user.email).toBe('ana@after.local');
    expect(result.accessToken).toBeTruthy();

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      ...EXISTING_USER,
      id: 'u-reg',
      email: 'nova@after.local',
    });
    const registered = await service.register({
      name: 'Nova',
      email: 'nova@after.local',
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: Role.USER,
    });
    expect(registered.user.email).toBe('nova@after.local');
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toBeTruthy();
  });

  it('token de onboarding não serve como JWT de sessão', () => {
    const strategy = new JwtStrategy({
      getOrThrow: (key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret';
        throw new Error(key);
      },
    } as unknown as ConfigService);
    expect(() =>
      strategy.validate({
        typ: SOCIAL_ONBOARDING_TYP,
        sub: 'jti-1',
        email: 'nova@gmail.com',
        role: 'USER',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('DTO de conclusão rejeita email e providerId extras', async () => {
    const dto = plainToInstance(CompleteSocialRegistrationDto, {
      onboardingToken: 'a'.repeat(24),
      accountType: 'user',
      name: 'Nova',
      state: 'SP',
      city: 'São Paulo',
      email: 'hacker@evil.com',
      providerId: 'forged',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
