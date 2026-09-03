import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

function config(map: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => map[key],
  } as unknown as ConfigService;
}

describe('AuthService admin vs public login', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
  };
  const jwt = new JwtService({ secret: 'test-secret' });
  const password = 'senha123';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(password, 10);
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    service = new AuthService(
      prisma as never,
      jwt,
      config({ JWT_SECRET: 'test-secret' }),
    );
  });

  function user(role: Role, email = 'conta@after.local') {
    return {
      id: `id-${role}`,
      name: 'Conta',
      email,
      passwordHash,
      role,
      state: 'SP',
      city: 'São Paulo',
      avatarUrl: null,
      venue: null,
    };
  }

  it('POST /auth/login recusa ADMIN mesmo com senha correta', async () => {
    prisma.user.findUnique.mockResolvedValue(
      user(Role.ADMIN, 'admin@after.local'),
    );
    await expect(
      service.login({ email: 'admin@after.local', password }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.login({ email: 'admin@after.local', password }),
    ).rejects.toThrow('Credenciais inválidas');
  });

  it('POST /admin/auth/login recusa USER', async () => {
    prisma.user.findUnique.mockResolvedValue(user(Role.USER));
    await expect(
      service.loginAdmin({ email: 'conta@after.local', password }),
    ).rejects.toThrow('Credenciais inválidas');
  });

  it('POST /admin/auth/login recusa VENUE', async () => {
    prisma.user.findUnique.mockResolvedValue(user(Role.VENUE));
    await expect(
      service.loginAdmin({ email: 'conta@after.local', password }),
    ).rejects.toThrow('Credenciais inválidas');
  });

  it('POST /admin/auth/login aceita ADMIN e emite JWT com role ADMIN', async () => {
    prisma.user.findUnique.mockResolvedValue(
      user(Role.ADMIN, 'admin@after.local'),
    );
    const result = await service.loginAdmin({
      email: 'admin@after.local',
      password,
    });
    expect(result.user.role).toBe(Role.ADMIN);
    const payload = jwt.verify<{ sub: string; email: string; role: string }>(
      result.accessToken,
    );
    expect(payload.sub).toBe('id-ADMIN');
    expect(payload.email).toBe('admin@after.local');
    expect(payload.role).toBe('ADMIN');
  });

  it('login social de conta ADMIN é recusado', async () => {
    prisma.user.findUnique.mockResolvedValue(
      user(Role.ADMIN, 'admin@after.local'),
    );
    jest.spyOn(service as never, 'verifyGoogleIdToken').mockResolvedValue({
      sub: 'gid-admin',
      email: 'admin@after.local',
      name: 'Admin',
    } as never);
    await expect(
      service.loginWithGoogle({ idToken: 'google-id-token-value-ok' }),
    ).rejects.toThrow('Credenciais inválidas');
  });
});
