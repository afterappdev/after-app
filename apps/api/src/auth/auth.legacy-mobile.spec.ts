import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { VENUE_SIGNUP_BONUS_CREDITS } from '../common/constants/credits';
import { WEB_REGISTRATION_CHANNEL } from './registration-profile';

function config(): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === 'WELCOME_CREDIT_HMAC_SECRET') return 'welcome-credit-hmac-test-secret-32';
      if (key === 'OAUTH_REDIRECT_ORIGINS') return 'https://app-after.com.br';
      if (key === 'PUBLIC_APP_URL') return 'https://app-after.com.br';
      return undefined;
    },
  } as ConfigService;
}

function createPrisma() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    socialOnboardingToken: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
    welcomeCreditClaim: { updateMany: jest.fn() },
    creditPurchase: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: typeof prisma) => unknown)(prisma);
    return arg;
  });
  return prisma;
}

/** Payload equivalente a Android 1.0.1 build 15 / iOS 1.0.2 build 18 publicados. */
const legacyUserRegister = {
  name: 'Ana',
  email: 'ana.legacy@after.local',
  password: 'senha123',
  state: 'SP',
  city: 'Campinas',
  role: Role.USER,
};

const legacyVenueRegister = {
  name: 'Bar Legado',
  email: 'bar.legacy@after.local',
  password: 'senha123',
  state: 'SP',
  city: 'Campinas',
  role: Role.VENUE,
};

describe('compatibilidade cadastro apps publicados', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: AuthService;

  beforeEach(() => {
    prisma = createPrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      const data = args.data;
      const nested = data.ownedVenues as { create?: object } | undefined;
      const hasVenue = nested?.create != null;
      return {
        id: 'u1',
        name: (data.name as string) ?? 'x',
        email: (data.email as string) ?? 'x@after.local',
        role: hasVenue ? Role.VENUE : Role.USER,
        state: (data.state as string) ?? 'SP',
        city: (data.city as string) ?? 'Campinas',
        avatarUrl: null,
        activeVenueId: null,
        ownedVenues: hasVenue
          ? [
              {
                id: 'v-legacy',
                name: (data.name as string) ?? 'Bar',
                city: (data.city as string) ?? 'Campinas',
                state: (data.state as string) ?? 'SP',
                logoUrl: null,
                createdAt: new Date(),
              },
            ]
          : [],
      };
    });
    service = new AuthService(prisma as never, new JwtService({ secret: 'test-secret' }), config());
  });

  it('cadastro comum legado não exige faixa etária', async () => {
    await service.register(legacyUserRegister);
    expect(prisma.user.create).toHaveBeenCalled();
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.ageBand).toBeUndefined();
    expect(data.ownedVenues).toBeUndefined();
  });

  it('cadastro de estabelecimento legado inicia com saldo zero e sem bônus welcome', async () => {
    await service.register(legacyVenueRegister);
    const venue = prisma.user.create.mock.calls[0][0].data.ownedVenues.create;
    expect(venue.wallet.create.balance).toBe(0);
    expect(venue.purchases).toBeUndefined();
    expect(venue.documentType).toBeUndefined();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('After Web sem faixa continua bloqueado', async () => {
    await expect(
      service.register(
        {
          ...legacyUserRegister,
          registrationChannel: WEB_REGISTRATION_CHANNEL,
        },
        'https://app-after.com.br',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('After Web com faixa cria conta enriched', async () => {
    await service.register(
      {
        ...legacyUserRegister,
        ageBand: 'AGE_36_50',
        registrationChannel: WEB_REGISTRATION_CHANNEL,
      },
      'https://app-after.com.br',
    );
    expect(prisma.user.create.mock.calls[0][0].data.ageBand).toBe('AGE_36_50');
  });
});
