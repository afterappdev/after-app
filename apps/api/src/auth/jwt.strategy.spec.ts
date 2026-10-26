import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountLifecycleStatus } from '@prisma/client';
import { ACCOUNT_RECOVERY_TYP } from '../users/account-recovery';
import { JwtStrategy } from './jwt.strategy';
import { SOCIAL_ONBOARDING_TYP } from './social-onboarding';

function config(): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      throw new Error(key);
    },
  } as unknown as ConfigService;
}

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    accountStatus: AccountLifecycleStatus.ACTIVE,
    sessionInvalidatedAt: null,
    sessionVersion: 0,
    ...overrides,
  };
}

describe('JwtStrategy', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
  };
  let strategy: JwtStrategy;

  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    strategy = new JwtStrategy(config(), prisma as never);
  });

  it('rejeita JWT de onboarding social', async () => {
    await expect(
      strategy.validate({
        typ: SOCIAL_ONBOARDING_TYP,
        sub: 'jti-1',
        email: 'nova@gmail.com',
        role: 'USER',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('aceita JWT de usuário existente com sv correto', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser({ sessionVersion: 2 }));
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'ana@after.local',
        role: 'USER',
        sv: 2,
      }),
    ).resolves.toEqual({
      userId: 'u1',
      email: 'ana@after.local',
      role: 'USER',
      tokenScope: 'session',
    });
  });

  it('aceita JWT legacy sem sv quando sessionVersion é 0', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser());
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'ana@after.local',
        role: 'USER',
      }),
    ).resolves.toMatchObject({ tokenScope: 'session' });
  });

  it('rejeita JWT legacy sem sv quando sessionVersion > 0', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser({ sessionVersion: 1 }));
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'ana@after.local',
        role: 'USER',
        iat: Math.floor(Date.now() / 1000),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita JWT com sv desatualizado', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser({ sessionVersion: 3 }));
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'ana@after.local',
        role: 'USER',
        sv: 2,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('legacy: rejeita JWT emitido antes de sessionInvalidatedAt', async () => {
    prisma.user.findUnique.mockResolvedValue(
      activeUser({
        sessionInvalidatedAt: new Date('2026-10-26T15:00:00.000Z'),
      }),
    );
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'ana@after.local',
        role: 'USER',
        iat: Math.floor(new Date('2026-10-26T14:00:00.000Z').getTime() / 1000),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('legacy: rejeita JWT no mesmo instante de sessionInvalidatedAt', async () => {
    const invalidated = new Date('2026-10-26T15:00:00.900Z');
    prisma.user.findUnique.mockResolvedValue(
      activeUser({ sessionInvalidatedAt: invalidated }),
    );
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'ana@after.local',
        role: 'USER',
        iat: Math.floor(invalidated.getTime() / 1000),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sv correto aceita mesmo com iat no mesmo segundo da invalidação', async () => {
    const invalidated = new Date('2026-10-26T15:00:00.900Z');
    prisma.user.findUnique.mockResolvedValue(
      activeUser({
        sessionVersion: 5,
        sessionInvalidatedAt: invalidated,
      }),
    );
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'ana@after.local',
        role: 'USER',
        sv: 5,
        iat: Math.floor(invalidated.getTime() / 1000),
      }),
    ).resolves.toMatchObject({ tokenScope: 'session' });
  });

  it('rejeita sessão normal em conta PENDING_DELETION', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      sessionInvalidatedAt: new Date(),
      sessionVersion: 1,
    });
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'ana@after.local',
        role: 'USER',
        sv: 1,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('aceita recovery JWT em conta PENDING_DELETION', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      sessionInvalidatedAt: new Date('2026-10-26T15:00:00.000Z'),
      sessionVersion: 2,
    });
    await expect(
      strategy.validate({
        typ: ACCOUNT_RECOVERY_TYP,
        sub: 'u1',
        email: 'ana@after.local',
        role: 'USER',
        iat: Math.floor(new Date('2026-10-26T16:00:00.000Z').getTime() / 1000),
      }),
    ).resolves.toMatchObject({
      userId: 'u1',
      tokenScope: 'recovery',
    });
  });

  it('rejeita JWT de conta já excluída', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      strategy.validate({
        sub: 'deleted-user',
        email: 'gone@after.local',
        role: 'USER',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
