import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PurchaseStatus, Role } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { VENUE_SIGNUP_BONUS_CREDITS } from '../common/constants/credits';
import { VENUE_DOCUMENT_TAKEN } from '../venues/venue-document';
import {
  WELCOME_CREDIT_HMAC_SECRET_KEY,
  readWelcomeCreditSecret,
  welcomeCreditDocumentKey,
} from './welcome-credit';

const SECRET = 'welcome-credit-hmac-test-secret-32';
const CPF = { documentType: 'CPF' as const, documentDigits: '12345678909' };
const CNPJ = { documentType: 'CNPJ' as const, documentDigits: '11444777000161' };

function config(secret: string | null = SECRET): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === WELCOME_CREDIT_HMAC_SECRET_KEY) return secret ?? undefined;
      return undefined;
    },
  } as ConfigService;
}

type Claim = { id: string; originVenueId: string | null };
type Wallet = {
  venueId: string;
  balance: number;
  vipBalance: number | undefined;
  kind: 'purchased' | 'signup';
};
type Purchase = { venueId: string; packageKey: string; credits: number; amountPaid: number };

function createHarness() {
  const committed = {
    claims: new Map<string, Claim>(),
    documents: new Set<string>(),
    documentOwners: new Map<string, string>(),
    wallets: [
      { venueId: 'old-venue', balance: 7, vipBalance: 4, kind: 'purchased' as const },
    ] as Wallet[],
    purchases: [
      { venueId: 'old-venue', packageKey: 'combo_5', credits: 5, amountPaid: 149.9 },
    ] as Purchase[],
  };
  const claimLock = new Map<string, number>();
  const documentLock = new Set<string>();
  const sql: string[] = [];
  const values: unknown[][] = [];
  const created: Array<{ data: Record<string, any> }> = [];
  let txSeq = 0;
  let fail: 'user' | 'purchase' | 'origin' | null = null;
  let gate: Promise<void> | null = null;
  let releaseGate: (() => void) | null = null;
  let waiting = 0;

  const social = {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUnique: jest.fn(),
  };

  function cloneClaims() {
    return new Map(committed.claims);
  }

  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    socialOnboardingToken: social,
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => {
      const txId = ++txSeq;
      const draft = {
        claims: cloneClaims(),
        documents: new Set(committed.documents),
        documentOwners: new Map(committed.documentOwners),
        wallets: committed.wallets.map((item) => ({ ...item })),
        purchases: committed.purchases.map((item) => ({ ...item })),
      };
      const mine = { claims: new Set<string>(), documents: new Set<string>() };
      const release = () => {
        for (const key of mine.claims) {
          if (claimLock.get(key) === txId) claimLock.delete(key);
        }
        for (const doc of mine.documents) documentLock.delete(doc);
      };
      const tx = {
        socialOnboardingToken: social,
        $executeRaw: async () => 1,
        $queryRaw: async (strings: TemplateStringsArray, ...bound: unknown[]) => {
          const sqlText = strings.join(' ');
          sql.push(sqlText);
          values.push(bound);
          if (sqlText.includes('FROM "Venue"')) {
            const docType = String(bound[0]);
            const docDigits = String(bound[1]);
            const docKey = `${docType}:${docDigits}`;
            const ownerUserId = draft.documentOwners.get(docKey);
            if (!ownerUserId) return [];
            return [{ id: `v-${docKey}`, ownerUserId }];
          }
          if (gate) {
            waiting += 1;
            if (waiting === 2) releaseGate?.();
            await gate;
          }
          const key = String(bound[1]);
          if (committed.claims.has(key) || claimLock.has(key)) return [];
          claimLock.set(key, txId);
          draft.claims.set(key, { id: String(bound[0]), originVenueId: null });
          mine.claims.add(key);
          return [{ id: bound[0] }];
        },
        user: {
          create: async (args: { data: Record<string, any> }) => {
            if (fail === 'user') throw new Error('wallet down');
            created.push(args);
            const venue =
              args.data.ownedVenues?.create ?? args.data.venue?.create;
            const docKey = venue ? `${venue.documentType}:${venue.documentDigits}` : '';
            const ownerUserId = String(args.data.id ?? `u-${txId}`);
            if (docKey && (committed.documents.has(docKey) || documentLock.has(docKey))) {
              throw Object.assign(new Error('unique'), {
                code: 'P2002',
                meta: { target: ['documentType', 'documentDigits'] },
              });
            }
            if (docKey) {
              documentLock.add(docKey);
              mine.documents.add(docKey);
              draft.documents.add(docKey);
              draft.documentOwners.set(docKey, ownerUserId);
            }
            const venueId = venue
              ? docKey
                ? `v-${draft.documents.size}`
                : `v-nodoc-${txId}`
              : null;
            if (venue && venueId) {
              draft.wallets.push({
                venueId: venueId as string,
                balance: venue.wallet.create.balance,
                vipBalance: venue.wallet.create.vipBalance,
                kind: 'signup',
              });
            }
            return {
              id: ownerUserId,
              name: args.data.name,
              email: args.data.email,
              role: args.data.role,
              state: args.data.state,
              city: args.data.city,
              avatarUrl: args.data.avatarUrl ?? null,
              activeVenueId: null,
              ownedVenues: venueId
                ? [
                    {
                      id: venueId,
                      name: venue.name,
                      city: venue.city,
                      state: venue.state,
                      logoUrl: null,
                      createdAt: new Date(),
                    },
                  ]
                : [],
            };
          },
        },
        creditPurchase: {
          create: async (args: { data: Purchase }) => {
            if (fail === 'purchase') throw new Error('purchase down');
            draft.purchases.push(args.data);
            return args.data;
          },
        },
        welcomeCreditClaim: {
          updateMany: async (args: {
            where: { id: string; originVenueId: null };
            data: { originVenueId: string };
          }) => {
            if (fail === 'origin') throw new Error('origin down');
            const row = [...draft.claims.values()].find(
              (item) => item.id === args.where.id && item.originVenueId === null,
            );
            if (!row) return { count: 0 };
            row.originVenueId = args.data.originVenueId;
            return { count: 1 };
          },
        },
      };
      try {
        const result = await fn(tx);
        committed.claims = draft.claims;
        committed.documents = draft.documents;
        committed.documentOwners = draft.documentOwners;
        committed.wallets = draft.wallets;
        committed.purchases = draft.purchases;
        release();
        return result;
      } catch (error) {
        release();
        throw error;
      }
    }),
  };

  const service = new AuthService(
    prisma as never,
    new JwtService({ secret: 'test-secret' }),
    config(),
  );

  return {
    prisma,
    service,
    social,
    sql,
    values,
    created,
    committed,
    armGate() {
      waiting = 0;
      gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
    },
    failAt(stage: 'user' | 'purchase' | 'origin') {
      fail = stage;
    },
    deleteAccounts() {
      committed.documents.clear();
      committed.documentOwners.clear();
      committed.wallets = committed.wallets.filter((item) => item.kind === 'purchased');
      committed.purchases = committed.purchases.filter((item) => item.packageKey !== 'welcome');
    },
  };
}

function venueInput(email: string, document = CPF, number = '123.456.789-09') {
  return {
    name: 'Bar da Ada',
    email,
    password: 'senha123',
    state: 'SP',
    city: 'São Paulo',
    role: Role.VENUE as const,
    documentType: document.documentType,
    documentNumber: number,
  };
}

function signupWallets(harness: ReturnType<typeof createHarness>) {
  return harness.committed.wallets.filter((item) => item.kind === 'signup');
}

function welcomePurchases(harness: ReturnType<typeof createHarness>) {
  return harness.committed.purchases.filter((item) => item.packageKey === 'welcome');
}

describe('identificador do benefício de boas-vindas', () => {
  it('usa HMAC com tipo e versão, sem o documento no resultado', () => {
    const key = welcomeCreditDocumentKey(SECRET, CPF);
    expect(key).toHaveLength(64);
    expect(key).toBe(welcomeCreditDocumentKey(SECRET, CPF));
    expect(key).not.toBe(
      welcomeCreditDocumentKey(SECRET, { documentType: 'CNPJ', documentDigits: CPF.documentDigits }),
    );
    expect(key).not.toBe(welcomeCreditDocumentKey(`${SECRET}-other`, CPF));
    expect(key).not.toBe(createHash('sha256').update(`v1:CPF:${CPF.documentDigits}`).digest('hex'));
    expect(key).not.toContain(CPF.documentDigits);
  });

  it('recusa segredo ausente ou curto e não consulta o JWT', () => {
    const jwtOnly = {
      get: (key: string) => (key === 'JWT_SECRET' ? 'jwt-secret-that-is-long-enough-32' : undefined),
    } as ConfigService;
    expect(() => readWelcomeCreditSecret(jwtOnly)).toThrow(ServiceUnavailableException);
    expect(() => readWelcomeCreditSecret(config('curto'))).toThrow(
      'Não foi possível concluir o cadastro agora.',
    );
  });
});

describe('concessão única por CPF ou CNPJ', () => {
  it('novo cadastro enriched inicia com zero comum, zero VIP e sem bônus welcome', async () => {
    const harness = createHarness();
    const cpf = await harness.service.register(venueInput('cpf@after.local'));
    const cnpj = await harness.service.register(
      venueInput('cnpj@after.local', CNPJ, '11.444.777/0001-61'),
    );

    expect(VENUE_SIGNUP_BONUS_CREDITS).toBe(0);
    expect(signupWallets(harness).map((item) => item.balance)).toEqual([0, 0]);
    expect(signupWallets(harness).every((item) => item.vipBalance === undefined)).toBe(true);
    expect(welcomePurchases(harness)).toHaveLength(0);
    expect(harness.committed.claims.size).toBe(0);
    expect(harness.sql.some((s) => s.includes('WelcomeCreditClaim'))).toBe(false);
    expect(JSON.stringify(cpf)).not.toContain(CPF.documentDigits);
    expect(JSON.stringify(cnpj)).not.toContain(CNPJ.documentDigits);
    expect(harness.committed.wallets.find((item) => item.venueId === 'old-venue')).toEqual({
      venueId: 'old-venue',
      balance: 7,
      vipBalance: 4,
      kind: 'purchased',
    });
    expect(harness.committed.purchases.find((item) => item.packageKey === 'combo_5')).toEqual({
      venueId: 'old-venue',
      packageKey: 'combo_5',
      credits: 5,
      amountPaid: 149.9,
    });
  });

  it('documento duplicado continua bloqueado; retry após exclusão não concede bônus', async () => {
    const harness = createHarness();
    await harness.service.register(venueInput('a@after.local'));
    await expect(harness.service.register(venueInput('b@after.local'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(harness.committed.claims.size).toBe(0);
    expect(signupWallets(harness)).toHaveLength(1);
    expect(signupWallets(harness)[0].balance).toBe(0);

    harness.deleteAccounts();
    const again = await harness.service.register(venueInput('c@after.local'));
    expect(again.user.email).toBe('c@after.local');
    expect(signupWallets(harness)).toEqual([
      expect.objectContaining({ balance: 0, vipBalance: undefined }),
    ]);
    expect(welcomePurchases(harness)).toHaveLength(0);
    expect(harness.committed.claims.size).toBe(0);
    expect(JSON.stringify(again)).not.toContain(CPF.documentDigits);
  });

  it('Google e Apple reutilizam o mesmo registro do documento', async () => {
    const harness = createHarness();
    await harness.service.register(venueInput('email@after.local'));
    harness.deleteAccounts();

    async function social(provider: 'google' | 'apple', email: string) {
      const jti = `jti-${provider}`;
      harness.social.findUnique.mockResolvedValue({
        id: jti,
        provider,
        providerId: `${provider}-id`,
        email,
        name: 'Bar da Ada',
        avatarUrl: null,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const token = new JwtService({ secret: 'test-secret' }).sign({
        typ: 'social_onboarding',
        jti,
        provider,
        providerId: `${provider}-id`,
        email,
      });
      return harness.service.completeSocialRegistration({
        onboardingToken: token,
        accountType: 'venue',
        name: 'Bar da Ada',
        state: 'SP',
        city: 'São Paulo',
        documentType: 'CPF',
        documentNumber: '12345678909',
      });
    }

    const google = await social('google', 'google@after.local');
    expect(google.user.venueId).toBeTruthy();
    expect(harness.created.at(-1)?.data.googleId).toBe('google-id');
    expect(signupWallets(harness).at(-1)?.balance).toBe(0);

    harness.deleteAccounts();
    const apple = await social('apple', 'apple@after.local');
    expect(apple.user.email).toBe('apple@after.local');
    expect(harness.created.at(-1)?.data.appleId).toBe('apple-id');
    expect(signupWallets(harness).at(-1)?.balance).toBe(0);
    expect(harness.committed.claims.size).toBe(0);
    expect(welcomePurchases(harness)).toHaveLength(0);
  });

  it('duas tentativas simultâneas com o mesmo documento deixam um cadastro e saldo zero', async () => {
    const harness = createHarness();
    const settled = await Promise.allSettled([
      harness.service.register(venueInput('a@after.local')),
      harness.service.register(venueInput('b@after.local')),
    ]);
    const rejected = settled.find((item) => item.status === 'rejected') as PromiseRejectedResult;
    expect(settled.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(rejected.reason.message).toBe(VENUE_DOCUMENT_TAKEN);
    expect(rejected.reason.message).not.toContain(CPF.documentDigits);
    expect(harness.committed.claims.size).toBe(0);
    expect(signupWallets(harness)).toEqual([
      expect.objectContaining({ balance: 0, vipBalance: undefined }),
    ]);
    expect(welcomePurchases(harness)).toHaveLength(0);
  });

  it('falha entre o registro e o crédito desfaz os dois', async () => {
    const harness = createHarness();
    harness.failAt('user');
    await expect(harness.service.register(venueInput('a@after.local'))).rejects.toThrow('wallet down');
    expect(harness.committed.claims.size).toBe(0);
    expect(signupWallets(harness)).toHaveLength(0);
    expect(welcomePurchases(harness)).toHaveLength(0);
  });

  it('sem bônus ativo, falha na compra welcome não se aplica ao cadastro', async () => {
    const harness = createHarness();
    harness.failAt('purchase');
    await harness.service.register(venueInput('a@after.local'));
    expect(harness.committed.claims.size).toBe(0);
    expect(signupWallets(harness)).toEqual([
      expect.objectContaining({ balance: 0, vipBalance: undefined }),
    ]);
    expect(welcomePurchases(harness)).toHaveLength(0);
  });

  it('sem bônus ativo, falha ao gravar origem welcome não se aplica ao cadastro', async () => {
    const harness = createHarness();
    harness.failAt('origin');
    await harness.service.register(venueInput('a@after.local'));
    expect(harness.committed.claims.size).toBe(0);
    expect(signupWallets(harness)).toEqual([
      expect.objectContaining({ balance: 0, vipBalance: undefined }),
    ]);
    expect(welcomePurchases(harness)).toHaveLength(0);
  });

  it('CPF ou CNPJ inválido não reserva o benefício', async () => {
    const harness = createHarness();
    await expect(
      harness.service.register(venueInput('a@after.local', CPF, '12345678900')),
    ).rejects.toThrow('CPF inválido.');
    await expect(
      harness.service.register(venueInput('b@after.local', CNPJ, '11444777000160')),
    ).rejects.toThrow('CNPJ inválido.');
    const legacy = await harness.service.register({
      ...venueInput('c@after.local'),
      documentType: undefined,
      documentNumber: undefined,
    });
    expect(legacy.user.venueId).toBeTruthy();
    expect(harness.sql.some((s) => s.includes('WelcomeCreditClaim'))).toBe(false);
    expect(harness.committed.claims.size).toBe(0);
    expect(signupWallets(harness)).toEqual([
      expect.objectContaining({ balance: VENUE_SIGNUP_BONUS_CREDITS, vipBalance: undefined }),
    ]);
  });

  it('sem bônus ativo, cadastro de estabelecimento não exige segredo welcome', async () => {
    const harness = createHarness();
    const withoutSecret = new AuthService(
      harness.prisma as never,
      new JwtService({ secret: 'test-secret' }),
      config(null),
    );
    await withoutSecret.register(venueInput('a@after.local'));
    expect(harness.committed.claims.size).toBe(0);
    expect(signupWallets(harness)).toEqual([
      expect.objectContaining({ balance: 0, vipBalance: undefined }),
    ]);

    await withoutSecret.register({
      name: 'Ana',
      email: 'ana@after.local',
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: Role.USER,
      ageBand: 'AGE_19_35',
    });
    expect(harness.sql.some((s) => s.includes('WelcomeCreditClaim'))).toBe(false);
    expect(signupWallets(harness)).toHaveLength(1);
  });
});

describe('contas antigas e caminhos que não concedem bônus', () => {
  const source = (path: string) => readFileSync(join(__dirname, path), 'utf8');

  it('a migration nova não preenche documentos antigos nem apaga a prova', () => {
    const provision = source(
      '../../prisma/migrations/20261023120000_welcome_credit_venue_provision/migration.sql',
    );
    expect(provision).toContain('WelcomeCreditVenueProvision');
    expect(provision).not.toContain('INSERT INTO');
    expect(provision).not.toContain('CreditWallet');
    const sql = source(
      '../../prisma/migrations/20261021200000_welcome_credit_claim/migration.sql',
    );
    expect(sql).toContain('CREATE TABLE "WelcomeCreditClaim"');
    expect(sql).toContain('CHECK ("creditsGranted" = 1)');
    expect(sql).not.toContain('INSERT INTO');
    expect(sql).not.toContain('REFERENCES');
    expect(sql).not.toContain('ON DELETE');
    expect(sql).not.toContain('CreditWallet');
    expect(sql).not.toContain('vipBalance');
  });

  it('preencher o documento depois vincula prova antiga e não concede outro bônus', () => {
    const fiscal = source('../venues/venues.service.ts');
    const save = fiscal.slice(fiscal.indexOf('async saveFiscalDocument'), fiscal.indexOf('private async requireOwnedVenue'));
    expect(save).toContain('linkHistoricalWelcomeClaim');
    expect(save).toContain('welcomeCreditsForDocumentLink');
    expect(save).not.toContain('reserveWelcomeCredit');
    expect(save).not.toContain('creditWallet');
    expect(save).not.toContain('vipBalance');
    expect(source('./credits.service.ts')).not.toContain('reserveWelcomeCredit');
    expect(source('./vip-credits.service.ts')).not.toContain('reserveWelcomeCredit');
    expect(source('./providers/card.provider.ts')).not.toContain('reserveWelcomeCredit');
    expect(source('../coupons/coupons.service.ts')).not.toContain('reserveWelcomeCredit');
    expect(source('../banners/banners.service.ts')).not.toContain('reserveWelcomeCredit');
    expect(source('../../prisma/seed.ts')).not.toContain("packageKey: 'welcome'");
    const deletion = source('../users/users.service.ts');
    expect(deletion).toContain('db.user.delete');
    expect(deletion).not.toContain('welcomeCreditClaim.delete');
  });
});
