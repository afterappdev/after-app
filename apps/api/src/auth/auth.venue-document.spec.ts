import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { VENUE_DOCUMENT_TAKEN } from '../venues/venue-document';

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
    },
    socialOnboardingToken: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
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

const base = {
  name: 'Bar da Ada',
  email: 'bar@after.local',
  password: 'senha123',
  state: 'SP',
  city: 'São Paulo',
  role: Role.VENUE as const,
};

describe('cadastro de estabelecimento com documento', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: AuthService;

  beforeEach(() => {
    prisma = createPrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    service = new AuthService(prisma as never, new JwtService({ secret: 'test-secret' }), config());
  });

  it('cadastro tradicional grava o documento normalizado uma vez', async () => {
    prisma.user.create.mockImplementation(async (args: { data: { id?: string; ownedVenues?: { create?: { documentDigits?: string; name?: string; city?: string; state?: string } } } }) => ({
      id: args.data.id ?? 'u1',
      name: base.name,
      email: base.email,
      role: Role.VENUE,
      state: 'SP',
      city: 'São Paulo',
      avatarUrl: null,
      activeVenueId: null,
      ownedVenues: [
        {
          id: 'v1',
          name: args.data.ownedVenues?.create?.name ?? base.name,
          city: args.data.ownedVenues?.create?.city ?? 'São Paulo',
          state: args.data.ownedVenues?.create?.state ?? 'SP',
          logoUrl: null,
          createdAt: new Date(),
        },
      ],
    }));
    const result = await service.register({
      ...base,
      documentType: 'CPF',
      documentNumber: '123.456.789-09',
    });
    expect(result.user).not.toHaveProperty('documentDigits');
    expect(JSON.stringify(result)).not.toContain('12345678909');
    expect(prisma.user.create.mock.calls[0][0].data.ownedVenues.create.documentDigits).toBe('12345678909');
    expect(prisma.user.create.mock.calls[0][0].data.ownedVenues.create.documentType).toBe('CPF');
  });

  it('usuário comum ignora documento e conta antiga entra sem ele', async () => {
    prisma.user.create.mockResolvedValue({
      id: 'u-user',
      name: 'Ana',
      email: 'ana@after.local',
      role: Role.USER,
      state: 'SP',
      city: 'São Paulo',
      avatarUrl: null,
      ownedVenues: [],
      activeVenueId: null,
    });
    await service.register({
      name: 'Ana',
      email: 'ana@after.local',
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: Role.USER,
      ageBand: 'AGE_36_50',
      documentType: 'CPF',
      documentNumber: '123.456.789-09',
    });
    expect(prisma.user.create.mock.calls[0][0].data.ownedVenues).toBeUndefined();

    prisma.user.findUnique.mockResolvedValue({
      id: 'u-old',
      name: 'Antigo',
      email: 'old@after.local',
      passwordHash: await bcrypt.hash('senha123', 4),
      role: Role.VENUE,
      state: 'SP',
      city: 'São Paulo',
      avatarUrl: null,
      activeVenueId: null,
      ownedVenues: [
        {
          id: 'v-old',
          name: 'Antigo',
          city: 'São Paulo',
          state: 'SP',
          logoUrl: null,
          createdAt: new Date(),
        },
      ],
    });
    const session = await service.login({ email: 'old@after.local', password: 'senha123' });
    expect(session.user.venueId).toBe('v-old');
    expect(JSON.stringify(session)).not.toContain('documentDigits');
  });

  it('cadastro social legado de estabelecimento concede 1 crédito sem documento', async () => {
    prisma.socialOnboardingToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.socialOnboardingToken.findUnique.mockResolvedValue({
      id: 'jti-1',
      provider: 'google',
      providerId: 'gid',
      email: 'bar@after.local',
      name: 'Bar',
      avatarUrl: null,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const token = new JwtService({ secret: 'test-secret' }).sign({
      typ: 'social_onboarding',
      jti: 'jti-1',
      provider: 'google',
      providerId: 'gid',
      email: 'bar@after.local',
    });
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      name: 'Bar da Ada',
      email: 'bar@after.local',
      role: Role.VENUE,
      state: 'SP',
      city: 'São Paulo',
      avatarUrl: null,
      activeVenueId: null,
      ownedVenues: [
        {
          id: 'v1',
          name: 'Bar da Ada',
          city: 'São Paulo',
          state: 'SP',
          logoUrl: null,
          createdAt: new Date(),
        },
      ],
    });
    await service.completeSocialRegistration({
      onboardingToken: token,
      accountType: 'venue',
      name: 'Bar da Ada',
      state: 'SP',
      city: 'São Paulo',
    });
    expect(prisma.user.create.mock.calls[0][0].data.ownedVenues.create.purchases.create.packageKey).toBe(
      'welcome',
    );
    expect(prisma.user.create.mock.calls[0][0].data.ownedVenues.create.documentDigits).toBeUndefined();
  });

  it('After Web exige documento no cadastro social de estabelecimento', async () => {
    prisma.socialOnboardingToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.socialOnboardingToken.findUnique.mockResolvedValue({
      id: 'jti-web',
      provider: 'google',
      providerId: 'gid',
      email: 'web@after.local',
      name: 'Bar',
      avatarUrl: null,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const token = new JwtService({ secret: 'test-secret' }).sign({
      typ: 'social_onboarding',
      jti: 'jti-web',
      provider: 'google',
      providerId: 'gid',
      email: 'web@after.local',
    });
    await expect(
      service.completeSocialRegistration(
        {
          onboardingToken: token,
          accountType: 'venue',
          name: 'Bar da Ada',
          state: 'SP',
          city: 'São Paulo',
          registrationChannel: 'after_web',
        },
        'https://app-after.com.br',
      ),
    ).rejects.toThrow('Informe um CPF ou CNPJ.');
  });

  it('cadastro social enriched grava documento normalizado', async () => {
    prisma.socialOnboardingToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.socialOnboardingToken.findUnique.mockResolvedValue({
      id: 'jti-2',
      provider: 'google',
      providerId: 'gid',
      email: 'bar2@after.local',
      name: 'Bar',
      avatarUrl: null,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const token = new JwtService({ secret: 'test-secret' }).sign({
      typ: 'social_onboarding',
      jti: 'jti-2',
      provider: 'google',
      providerId: 'gid',
      email: 'bar2@after.local',
    });
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      name: 'Bar da Ada',
      email: 'bar2@after.local',
      role: Role.VENUE,
      state: 'SP',
      city: 'São Paulo',
      avatarUrl: null,
      activeVenueId: null,
      ownedVenues: [
        {
          id: 'v1',
          name: 'Bar da Ada',
          city: 'São Paulo',
          state: 'SP',
          logoUrl: null,
          createdAt: new Date(),
        },
      ],
    });
    await service.completeSocialRegistration({
      onboardingToken: token,
      accountType: 'venue',
      name: 'Bar da Ada',
      state: 'SP',
      city: 'São Paulo',
      documentType: 'CNPJ',
      documentNumber: '11444777000161',
    });
    expect(prisma.user.create.mock.calls[0][0].data.ownedVenues.create.documentDigits).toBe('11444777000161');
  });

  it('cadastros simultâneos: o índice único impede o segundo sem expor o documento', async () => {
    const documentOwners = new Map<string, string>();
    prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...bound: unknown[]) => {
      const sql = strings.join(' ');
      if (sql.includes('FROM "Venue"')) {
        const docKey = `${bound[0]}:${bound[1]}`;
        const ownerUserId = documentOwners.get(docKey);
        if (!ownerUserId) return [];
        return [{ id: 'v-existing', ownerUserId }];
      }
      return [{ id: 'claim-1' }];
    });
    let calls = 0;
    prisma.user.create.mockImplementation(async (args: { data: { id?: string; ownedVenues?: { create?: { documentType?: string; documentDigits?: string } } } }) => {
      calls += 1;
      const doc = args.data.ownedVenues?.create;
      if (doc?.documentDigits) {
        const docKey = `${doc.documentType}:${doc.documentDigits}`;
        if (documentOwners.has(docKey)) {
          throw new ConflictException(VENUE_DOCUMENT_TAKEN);
        }
        documentOwners.set(docKey, args.data.id ?? 'u1');
      }
      if (calls > 1) {
        throw new ConflictException(VENUE_DOCUMENT_TAKEN);
      }
      return {
        id: args.data.id ?? 'u1',
        name: base.name,
        email: 'a@after.local',
        role: Role.VENUE,
        state: 'SP',
        city: 'São Paulo',
        avatarUrl: null,
        activeVenueId: null,
        ownedVenues: [
          {
            id: 'v1',
            name: base.name,
            city: 'São Paulo',
            state: 'SP',
            logoUrl: null,
            createdAt: new Date(),
          },
        ],
      };
    });
    const input = {
      ...base,
      documentType: 'CPF' as const,
      documentNumber: '12345678909',
    };
    const settled = await Promise.allSettled([
      service.register({ ...input, email: 'a@after.local' }),
      service.register({ ...input, email: 'b@after.local' }),
    ]);
    const rejected = settled.find((item) => item.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(rejected.reason.message).toBe(VENUE_DOCUMENT_TAKEN);
    expect(rejected.reason.message).not.toContain('12345678909');
  });

  it('falha de banco desfaz o cadastro e não devolve sessão', async () => {
    prisma.user.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.register({
        ...base,
        documentType: 'CPF',
        documentNumber: '12345678909',
      }),
    ).rejects.toThrow('db down');
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });
});
