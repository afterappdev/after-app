import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

function config(map: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => map[key],
  } as unknown as ConfigService;
}

describe('AuthService Google web OAuth', () => {
  const originalEnv = { ...process.env };
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new AuthService(
      prisma as never,
      new JwtService({ secret: 'test-secret' }),
      config({
        GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'google-secret',
        GOOGLE_REDIRECT_URI: 'https://api.app-after.com.br/auth/google/callback',
        PUBLIC_API_URL: 'https://api.app-after.com.br',
        PUBLIC_APP_URL: 'https://app-after.com.br',
        OAUTH_REDIRECT_ORIGINS: 'https://app-after.com.br',
        JWT_SECRET: 'test-secret',
      }),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('aceita https://app-after.com.br e mantém callback na API', () => {
    const url = service.googleStartUrl('https://app-after.com.br/');
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://accounts.google.com');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://api.app-after.com.br/auth/google/callback',
    );
    expect(parsed.searchParams.get('client_id')).toBe(
      'web.apps.googleusercontent.com',
    );
  });

  it('aceita hash interno do origin oficial', () => {
    expect(() =>
      service.googleStartUrl('https://app-after.com.br/#/login'),
    ).not.toThrow();
  });

  it('bloqueia domínio arbitrário, lookalike, http e workers.dev', () => {
    expect(() => service.googleStartUrl('https://evil.example/')).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.googleStartUrl('https://app-after.com.br.evil.com/'),
    ).toThrow(BadRequestException);
    expect(() => service.googleStartUrl('http://app-after.com.br/')).toThrow(
      BadRequestException,
    );
    expect(() => service.googleStartUrl('https://after.workers.dev/')).toThrow(
      BadRequestException,
    );
  });

  it('login e-mail/senha continua funcionando', async () => {
    const passwordHash = await bcrypt.hash('senha123', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      name: 'Ana',
      email: 'ana@after.local',
      passwordHash,
      role: 'USER',
      state: 'SP',
      city: 'São Paulo',
      avatarUrl: null,
      venue: null,
    });
    const result = await service.login({
      email: 'ana@after.local',
      password: 'senha123',
    });
    expect(result.user.email).toBe('ana@after.local');
    expect(result.accessToken).toBeTruthy();
  });

  it('Google com e-mail já cadastrado não vincula silenciosamente', async () => {
    jest.spyOn(service as any, 'verifyGoogleIdToken').mockResolvedValue({
      sub: 'gid-1',
      email: 'ana@after.local',
      name: 'Ana',
      picture: null,
    } as never);
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'u1' });
    await expect(
      service.loginWithGoogle({ idToken: 'id-token' }),
    ).rejects.toThrow('Já existe uma conta com este e-mail');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
