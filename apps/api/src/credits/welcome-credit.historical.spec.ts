import { readFileSync } from 'fs';
import { join } from 'path';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VenuesService } from '../venues/venues.service';
import {
  assertWelcomeReconcileAuthorized,
  historicalWelcomeCredits,
  linkHistoricalWelcomeClaim,
  reconcileHistoricalWelcomeClaims,
  reserveWelcomeCredit,
  welcomeCreditDocumentKey,
  welcomeCreditsForDocumentLink,
} from './welcome-credit';

const SECRET = 'welcome-credit-hmac-test-secret-32';
const CPF = '12345678909';
const CNPJ = '11444777000161';

type Claim = {
  id: string;
  creditsGranted: number;
  originVenueId: string | null;
  source: 'SIGNUP' | 'HISTORICAL';
};

function createStore() {
  const state = {
    venue: {
      id: 'v-old',
      ownerUserId: 'owner',
      documentType: null as 'CPF' | 'CNPJ' | null,
      documentDigits: null as string | null,
    },
    wallet: { balance: 8, vipBalance: 3 },
    purchases: [
      { venueId: 'v-old', packageKey: 'welcome', credits: 2, amountPaid: 0 },
      { venueId: 'v-old', packageKey: 'combo_5', credits: 5, amountPaid: 149.9 },
    ],
    claims: new Map<string, Claim>(),
    extraVenues: [] as Array<{
      id: string;
      documentType: 'CPF' | 'CNPJ' | null;
      documentDigits: string | null;
      welcomeCredits: number;
    }>,
  };
  let failUpdate = false;
  let gate: Promise<void> | null = null;
  let releaseGate: (() => void) | null = null;
  let waiting = 0;
  const walletWrites: string[] = [];

  const prisma = {
    venue: {
      findUnique: jest.fn(async () => ({ ...state.venue })),
      update: jest.fn(async (args: { data: { documentType: 'CPF' | 'CNPJ'; documentDigits: string } }) => {
        if (failUpdate) throw new Error('document down');
        state.venue = { ...state.venue, ...args.data };
        return { ...state.venue };
      }),
      count: jest.fn(async () => {
        const rows = [state.venue, ...state.extraVenues];
        return rows.filter((row) => !row.documentType || !row.documentDigits).length;
      }),
      findMany: jest.fn(async () => {
        return [state.venue, ...state.extraVenues]
          .filter((row) => row.documentType && row.documentDigits)
          .map((row) => ({
            id: row.id,
            documentType: row.documentType,
            documentDigits: row.documentDigits,
          }));
      }),
    },
    welcomeCreditVenueProvision: {
      findUnique: jest.fn(async (args: { where: { venueId: string } }) => {
        if (args.where.venueId === 'v-provision-only') {
          return { creditsGranted: 1 };
        }
        return null;
      }),
    },
    creditPurchase: {
      findMany: jest.fn(async (args: { where: { venueId: string; packageKey: string } }) => {
        const own = state.purchases.filter(
          (row) => row.venueId === args.where.venueId && row.packageKey === args.where.packageKey,
        );
        const extra = state.extraVenues
          .filter((row) => row.id === args.where.venueId && args.where.packageKey === 'welcome' && row.welcomeCredits > 0)
          .map((row) => ({ credits: row.welcomeCredits }));
        return [...own.map((row) => ({ credits: row.credits })), ...extra];
      }),
      create: jest.fn(async () => {
        throw new Error('purchase created');
      }),
    },
    creditWallet: {
      update: jest.fn(async () => {
        walletWrites.push('update');
      }),
      upsert: jest.fn(async () => {
        walletWrites.push('upsert');
      }),
    },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...bound: unknown[]) => {
      const sql = strings.join(' ');
      if (gate) {
        waiting += 1;
        if (waiting === 2) releaseGate?.();
        await gate;
      }
      const key = String(bound[1]);
      if (state.claims.has(key)) return [];
      const source = sql.includes("'HISTORICAL'") ? 'HISTORICAL' : 'SIGNUP';
      const claim: Claim = {
        id: String(bound[0]),
        creditsGranted: Number(bound[3]),
        originVenueId: source === 'HISTORICAL' ? String(bound[4]) : null,
        source,
      };
      state.claims.set(key, claim);
      return [{ id: claim.id }];
    }),
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => {
      const snapshot = {
        venue: { ...state.venue },
        claims: new Map(state.claims),
        purchases: state.purchases.map((row) => ({ ...row })),
        wallet: { ...state.wallet },
      };
      try {
        return await fn(prisma);
      } catch (error) {
        state.venue = snapshot.venue;
        state.claims = snapshot.claims;
        state.purchases = snapshot.purchases;
        state.wallet = snapshot.wallet;
        throw error;
      }
    }),
  };

  const config = {
    get: (key: string) => (key === 'WELCOME_CREDIT_HMAC_SECRET' ? SECRET : undefined),
  } as ConfigService;
  const service = new VenuesService(
    prisma as never,
    { deleteStoredUploads: jest.fn() } as never,
    undefined,
    config,
  );

  return {
    state,
    prisma,
    service,
    walletWrites,
    armGate() {
      waiting = 0;
      gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
    },
    failUpdate() {
      failUpdate = true;
    },
    deleteAccount() {
      state.venue.documentType = null;
      state.venue.documentDigits = null;
      state.purchases = state.purchases.filter((row) => row.packageKey !== 'welcome');
      state.purchases = [];
    },
  };
}

async function save(store: ReturnType<typeof createStore>, type: 'CPF' | 'CNPJ', number: string) {
  return store.service.saveFiscalDocument('owner', 'v-old', {
    documentType: type,
    documentNumber: number,
  });
}

describe('vinculação histórica do benefício', () => {
  it('preencher CPF ou CNPJ depois grava a quantidade 2 e não mexe no saldo', async () => {
    const cpf = createStore();
    const savedCpf = await save(cpf, 'CPF', '123.456.789-09');
    expect(savedCpf.documentDigits).toBe(CPF);
    expect(cpf.state.wallet).toEqual({ balance: 8, vipBalance: 3 });
    expect(cpf.state.purchases).toHaveLength(2);
    expect(cpf.walletWrites).toEqual([]);
    expect(cpf.prisma.creditPurchase.create).not.toHaveBeenCalled();
    const claim = [...cpf.state.claims.values()][0];
    expect(claim).toEqual(
      expect.objectContaining({ creditsGranted: 2, originVenueId: 'v-old', source: 'HISTORICAL' }),
    );
    expect(JSON.stringify(savedCpf)).not.toContain([...cpf.state.claims.keys()][0]);

    const cnpj = createStore();
    await save(cnpj, 'CNPJ', '11.444.777/0001-61');
    expect([...cnpj.state.claims.values()][0]).toEqual(
      expect.objectContaining({ creditsGranted: 2, source: 'HISTORICAL' }),
    );
    expect(cnpj.state.wallet.vipBalance).toBe(3);
  });

  it('exclusão depois da vinculação não libera outro bônus', async () => {
    const store = createStore();
    await save(store, 'CPF', CPF);
    store.deleteAccount();
    const reserved = await reserveWelcomeCredit(
      store.prisma as never,
      { documentType: 'CPF', documentDigits: CPF },
      SECRET,
    );
    expect(reserved).toBeNull();
    expect(store.state.claims.size).toBe(1);
    expect([...store.state.claims.values()][0].creditsGranted).toBe(2);
    expect(store.state.wallet).toEqual({ balance: 8, vipBalance: 3 });
  });

  it('provisão sem compra welcome vincula 1 crédito sem alterar saldo', async () => {
    const store = createStore();
    store.state.venue.id = 'v-provision-only';
    store.state.purchases = store.state.purchases.filter((row) => row.packageKey !== 'welcome');
    await store.service.saveFiscalDocument('owner', 'v-provision-only', {
      documentType: 'CPF',
      documentNumber: CPF,
    });
    expect([...store.state.claims.values()][0]).toEqual(
      expect.objectContaining({ creditsGranted: 1, originVenueId: 'v-provision-only', source: 'HISTORICAL' }),
    );
    expect(store.state.wallet).toEqual({ balance: 8, vipBalance: 3 });
  });

  it('conta antiga sem compra welcome nem provisão não cria prova', async () => {
    const store = createStore();
    store.state.purchases = store.state.purchases.filter((row) => row.packageKey !== 'welcome');
    await save(store, 'CPF', CPF);
    expect(store.state.claims.size).toBe(0);
    expect(store.state.venue.documentDigits).toBe(CPF);
    expect(store.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(store.state.wallet).toEqual({ balance: 8, vipBalance: 3 });
  });

  it('documento já registrado não é sobrescrito', async () => {
    const store = createStore();
    const key = welcomeCreditDocumentKey(SECRET, { documentType: 'CPF', documentDigits: CPF });
    store.state.claims.set(key, {
      id: 'claim-existing',
      creditsGranted: 1,
      originVenueId: 'v-newer',
      source: 'SIGNUP',
    });
    await save(store, 'CPF', CPF);
    expect(store.state.claims.size).toBe(1);
    expect(store.state.claims.get(key)).toEqual({
      id: 'claim-existing',
      creditsGranted: 1,
      originVenueId: 'v-newer',
      source: 'SIGNUP',
    });
    expect(store.state.venue.documentDigits).toBe(CPF);
  });

  it('salvar de novo é idempotente', async () => {
    const store = createStore();
    await save(store, 'CPF', CPF);
    await save(store, 'CPF', CPF);
    expect(store.state.claims.size).toBe(1);
    expect([...store.state.claims.values()][0].creditsGranted).toBe(2);
  });

  it('falha na gravação do documento desfaz a prova', async () => {
    const store = createStore();
    store.failUpdate();
    await expect(save(store, 'CPF', CPF)).rejects.toThrow('document down');
    expect(store.state.claims.size).toBe(0);
    expect(store.state.venue.documentDigits).toBeNull();
    expect(store.state.wallet).toEqual({ balance: 8, vipBalance: 3 });
    expect(store.state.purchases.map((row) => row.packageKey).sort()).toEqual(['combo_5', 'welcome']);
  });

  it('sem segredo a prova e o documento ficam como estavam', async () => {
    const store = createStore();
    const blocked = new VenuesService(
      store.prisma as never,
      { deleteStoredUploads: jest.fn() } as never,
      undefined,
      { get: () => undefined } as ConfigService,
    );
    await expect(
      blocked.saveFiscalDocument('owner', 'v-old', { documentType: 'CPF', documentNumber: CPF }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(store.state.claims.size).toBe(0);
    expect(store.state.venue.documentDigits).toBeNull();
  });

  it('reconciliação repetida e concorrente não duplica nem altera saldos', async () => {
    const store = createStore();
    store.state.venue.documentType = 'CPF';
    store.state.venue.documentDigits = CPF;
    store.state.extraVenues.push({
      id: 'v-plain',
      documentType: 'CNPJ',
      documentDigits: CNPJ,
      welcomeCredits: 0,
    });

    const first = await reconcileHistoricalWelcomeClaims(store.prisma as never, SECRET);
    const second = await reconcileHistoricalWelcomeClaims(store.prisma as never, SECRET);
    expect(first).toEqual({
      examined: 2,
      withoutDocument: 0,
      withoutWelcomeEvidence: 1,
      linked: 1,
      alreadyClaimed: 0,
    });
    expect(second.linked).toBe(0);
    expect(second.alreadyClaimed).toBe(1);
    expect(JSON.stringify(first)).not.toContain(CPF);
    expect(JSON.stringify(second)).not.toContain(CNPJ);
    expect([...store.state.claims.values()]).toEqual([
      expect.objectContaining({ creditsGranted: 2, originVenueId: 'v-old', source: 'HISTORICAL' }),
    ]);
    expect(store.state.wallet).toEqual({ balance: 8, vipBalance: 3 });
    expect(store.state.purchases).toHaveLength(2);

    const raced = createStore();
    raced.state.venue.documentType = 'CPF';
    raced.state.venue.documentDigits = CPF;
    raced.armGate();
    const settled = await Promise.all([
      reconcileHistoricalWelcomeClaims(raced.prisma as never, SECRET),
      reconcileHistoricalWelcomeClaims(raced.prisma as never, SECRET),
    ]);
    expect(settled.reduce((sum, report) => sum + report.linked, 0)).toBe(1);
    expect(raced.state.claims.size).toBe(1);
    expect([...raced.state.claims.values()][0].creditsGranted).toBe(2);
    expect([...raced.state.claims.values()][0].originVenueId).toBe('v-old');
  });

  it('a quantidade histórica inválida não grava o documento', async () => {
    const store = createStore();
    store.state.purchases = [{ venueId: 'v-old', packageKey: 'welcome', credits: 0, amountPaid: 0 }];
    await expect(historicalWelcomeCredits(store.prisma as never, 'v-old')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(
      linkHistoricalWelcomeClaim(
        store.prisma as never,
        { documentType: 'CPF', documentDigits: CPF },
        SECRET,
        'v-old',
        0,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(store.state.claims.size).toBe(0);
  });

  it('a rotina recusa produção e não entra na inicialização', () => {
    expect(() =>
      assertWelcomeReconcileAuthorized({
        NODE_ENV: 'production',
        WELCOME_CREDIT_RECONCILE: 'authorized',
        WELCOME_CREDIT_RECONCILE_DATABASE_URL:
          'postgresql://after_credit_ledger_test:disposable-local-only@127.0.0.1:55432/after_credit_ledger_test',
      }),
    ).toThrow('reconciliação recusada em produção');
    expect(() => assertWelcomeReconcileAuthorized({ NODE_ENV: 'test' })).toThrow(
      'reconciliação não autorizada',
    );
    expect(() =>
      assertWelcomeReconcileAuthorized({
        NODE_ENV: 'test',
        WELCOME_CREDIT_RECONCILE: 'authorized',
        WELCOME_CREDIT_RECONCILE_DATABASE_URL: 'postgresql://railway.internal/after',
      }),
    ).toThrow('host remoto');
    const main = readFileSync(join(__dirname, '../main.ts'), 'utf8');
    expect(main).not.toContain('reconcileHistoricalWelcomeClaims');
    const migration = readFileSync(
      join(__dirname, '../../prisma/migrations/20261021223000_welcome_credit_historical_source/migration.sql'),
      'utf8',
    );
    expect(migration).toContain("'HISTORICAL'");
    expect(migration).toContain('SIGNUP');
    expect(migration).not.toContain('INSERT INTO');
    expect(migration).not.toContain('CreditWallet');
  });
});
