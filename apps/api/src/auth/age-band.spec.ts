import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { MediaCleanupService } from '../uploads/media-cleanup.service';
import { AppleAuthTokensService } from './apple-auth-tokens.service';
import {
  AGE_BAND_INVALID,
  AGE_BAND_REQUIRED,
  AGE_BANDS,
  resolveUserAgeBand,
} from '../users/age-band';
import { UsersService } from '../users/users.service';

function config(): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === 'WELCOME_CREDIT_HMAC_SECRET') return 'welcome-credit-hmac-test-secret-32';
      return undefined;
    },
  } as ConfigService;
}

function createPrisma() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    socialOnboardingToken: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn().mockImplementation(async (strings: TemplateStringsArray) => {
      if (strings.join(' ').includes('FROM "Venue"')) return [];
      return [{ id: 'claim-1' }];
    }),
    $executeRaw: jest.fn().mockResolvedValue(1),
    welcomeCreditClaim: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    creditPurchase: {
      create: jest.fn().mockResolvedValue({ id: 'purchase-1' }),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
    return arg;
  });
  return prisma;
}

function createdUser(data: Record<string, unknown>) {
  return {
    id: 'u-new',
    avatarUrl: null,
    venue: null,
    ...data,
  };
}

describe('faixa etária', () => {
  it.each(AGE_BANDS)('aceita %s', (band) => {
    expect(resolveUserAgeBand(band)).toBe(band);
  });

  it('rejeita ausência e valor inválido', () => {
    expect(() => resolveUserAgeBand(undefined)).toThrow(AGE_BAND_REQUIRED);
    expect(() => resolveUserAgeBand('   ')).toThrow(AGE_BAND_REQUIRED);
    expect(() => resolveUserAgeBand('adulto')).toThrow(AGE_BAND_INVALID);
    expect(() => resolveUserAgeBand('18')).toThrow(AGE_BAND_INVALID);
  });

  it('DTO rejeita valor inválido com a mensagem estável', async () => {
    const dto = plainToInstance(RegisterDto, {
      name: 'Ana',
      email: 'ana@after.local',
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: 'USER',
      ageBand: 'maior-de-idade',
    });
    const errors = await validate(dto);
    const age = errors.find((error) => error.property === 'ageBand');
    expect(age?.constraints?.isIn).toBe(AGE_BAND_INVALID);
  });
});

describe('cadastro de usuário com faixa etária', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: AuthService;

  beforeEach(() => {
    prisma = createPrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(
      async (args: {
        data: Record<string, unknown> & {
          ownedVenues?: { create?: { name?: string } };
        };
      }) => {
        const row = createdUser(args.data);
        if (args.data.ownedVenues) {
          return {
            ...row,
            ownedVenues: [
              {
                id: 'v-age',
                name: args.data.ownedVenues.create?.name ?? 'Bar',
                city: 'São Paulo',
                state: 'SP',
                logoUrl: null,
              },
            ],
          };
        }
        return { ...row, ownedVenues: [] };
      },
    );
    service = new AuthService(
      prisma as never,
      new JwtService({ secret: 'test-secret' }),
      config(),
    );
  });

  it.each(AGE_BANDS)('cadastro tradicional persiste %s', async (band) => {
    await service.register({
      name: 'Ana',
      email: `${band}@after.local`,
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: Role.USER,
      ageBand: band,
    });
    expect(prisma.user.create.mock.calls.at(-1)[0].data.ageBand).toBe(band);
    expect(prisma.user.create.mock.calls.at(-1)[0].data.venue).toBeUndefined();
  });

  it('cadastro legado de app publicado sem faixa ainda cria a conta', async () => {
    await service.register({
      name: 'Ana',
      email: 'ana@after.local',
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: Role.USER,
    });
    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.user.create.mock.calls.at(-1)[0].data.ageBand).toBeUndefined();
  });

  it('valor inválido enviado ao serviço não cria a conta', async () => {
    await expect(
      service.register({
        name: 'Ana',
        email: 'ana@after.local',
        password: 'senha123',
        state: 'SP',
        city: 'São Paulo',
        role: Role.USER,
        ageBand: 'AGE_99' as 'AGE_0_18',
      }),
    ).rejects.toThrow(AGE_BAND_INVALID);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('estabelecimento continua sem faixa e ignora o campo se ele vier', async () => {
    await service.register({
      name: 'Bar da Ada',
      email: 'bar@after.local',
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: Role.VENUE,
      documentType: 'CPF',
      documentNumber: '12345678909',
      ageBand: 'AGE_OVER_50',
    });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.ageBand).toBeUndefined();
    expect(data.ownedVenues.create.documentDigits).toBe('12345678909');
    expect(data.ownedVenues.create.documentType).toBe('CPF');
  });

  it('conta antiga sem faixa entra normalmente', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-old',
      name: 'Antiga',
      email: 'old@after.local',
      passwordHash: await bcrypt.hash('senha123', 4),
      role: Role.USER,
      state: 'SP',
      city: 'São Paulo',
      avatarUrl: null,
      ageBand: null,
      venue: null,
    });
    const session = await service.login({
      email: 'old@after.local',
      password: 'senha123',
    });
    expect(session.accessToken).toBeTruthy();
    expect(session.user).not.toHaveProperty('ageBand');
  });

  describe('cadastro social', () => {
    function token(provider: 'google' | 'apple') {
      return new JwtService({ secret: 'test-secret' }).sign({
        typ: 'social_onboarding',
        jti: `jti-${provider}`,
        provider,
        providerId: provider === 'google' ? 'gid' : 'aid',
        email: 'nova@gmail.com',
      });
    }

    beforeEach(() => {
      prisma.socialOnboardingToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.socialOnboardingToken.findUnique.mockImplementation(
        async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          provider: where.id.includes('apple') ? 'apple' : 'google',
          providerId: where.id.includes('apple') ? 'aid' : 'gid',
          email: 'nova@gmail.com',
          name: 'Nova',
          avatarUrl: null,
          appleRefreshTokenEnc: null,
          appleClientId: null,
          usedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );
    });

    it.each(['google', 'apple'] as const)(
      '%s legado de app publicado cria conta sem faixa',
      async (provider) => {
        await service.completeSocialRegistration({
          onboardingToken: token(provider),
          accountType: 'user',
          name: 'Nova',
          state: 'SP',
          city: 'São Paulo',
        });
        expect(prisma.user.create.mock.calls[0][0].data.ageBand).toBeUndefined();
      },
    );

    it('After Web exige faixa no cadastro social', async () => {
      await expect(
        service.completeSocialRegistration(
          {
            onboardingToken: token('google'),
            accountType: 'user',
            name: 'Nova',
            state: 'SP',
            city: 'São Paulo',
            registrationChannel: 'after_web',
          },
          'https://app-after.com.br',
        ),
      ).rejects.toThrow(AGE_BAND_REQUIRED);
    });

    it.each(['google', 'apple'] as const)(
      '%s persiste a faixa escolhida',
      async (provider) => {
        await service.completeSocialRegistration({
          onboardingToken: token(provider),
          accountType: 'user',
          name: 'Nova',
          state: 'SP',
          city: 'São Paulo',
          ageBand: provider === 'apple' ? 'AGE_0_18' : 'AGE_36_50',
        });
        const data = prisma.user.create.mock.calls[0][0].data;
        expect(data.ageBand).toBe(provider === 'apple' ? 'AGE_0_18' : 'AGE_36_50');
        expect(data.role).toBe(Role.USER);
        expect(data.venue).toBeUndefined();
        if (provider === 'google') expect(data.googleId).toBe('gid');
        if (provider === 'apple') expect(data.appleId).toBe('aid');
      },
    );

    it('token inválido continua falhando antes da faixa', async () => {
      await expect(
        service.completeSocialRegistration({
          onboardingToken: 'nao-e-um-jwt',
          accountType: 'user',
          name: 'Nova',
          state: 'SP',
          city: 'São Paulo',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

describe('perfil atualiza a faixa sem obrigar a conta antiga', () => {
  it('grava a faixa escolhida e não apaga quando o campo não vem', async () => {
    const prisma = createPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      avatarUrl: null,
      city: 'São Paulo',
      state: 'SP',
      role: Role.USER,
    });
    prisma.user.update.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'u1',
      name: 'Ana',
      email: 'ana@after.local',
      role: Role.USER,
      state: 'SP',
      city: 'São Paulo',
      avatarUrl: null,
      ageBand: args.data.ageBand ?? 'AGE_19_35',
    }));
    const service = new UsersService(
      prisma as never,
      { deleteStoredUpload: jest.fn() } as unknown as MediaCleanupService,
      { revokeForAccount: jest.fn() } as unknown as AppleAuthTokensService,
    );

    await service.updateMe('u1', { ageBand: 'AGE_OVER_50' });
    expect(prisma.user.update.mock.calls[0][0].data.ageBand).toBe('AGE_OVER_50');

    await service.updateMe('u1', { name: 'Ana Silva' });
    expect(prisma.user.update.mock.calls[1][0].data).not.toHaveProperty('ageBand');
  });

  it('não grava faixa na conta de estabelecimento', async () => {
    const prisma = createPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-venue',
      avatarUrl: null,
      city: 'São Paulo',
      state: 'SP',
      role: Role.VENUE,
    });
    prisma.user.update.mockResolvedValue({
      id: 'u-venue',
      name: 'Bar',
      email: 'bar@after.local',
      role: Role.VENUE,
      state: 'SP',
      city: 'São Paulo',
      avatarUrl: null,
      ageBand: null,
    });
    const service = new UsersService(
      prisma as never,
      { deleteStoredUpload: jest.fn() } as unknown as MediaCleanupService,
      { revokeForAccount: jest.fn() } as unknown as AppleAuthTokensService,
    );
    await service.updateMe('u-venue', { name: 'Bar da Ada', ageBand: 'AGE_19_35' });
    expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty('ageBand');
    expect(prisma.user.update.mock.calls[0][0].data.name).toBe('Bar da Ada');
  });
});
