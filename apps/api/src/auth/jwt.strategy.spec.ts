import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  it('aceita JWT de usuário existente', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'ana@after.local',
        role: 'USER',
      }),
    ).resolves.toEqual({
      userId: 'u1',
      email: 'ana@after.local',
      role: 'USER',
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
