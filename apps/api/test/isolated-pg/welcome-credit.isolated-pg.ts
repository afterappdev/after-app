import { ConflictException } from '@nestjs/common';
import { PrismaClient, VenueDocumentType } from '@prisma/client';
import { assertVenueDocumentAvailableForOwner } from '../../src/venues/venue-document-policy';
import {
  ISOLATED_PG_DATABASE,
  ISOLATED_PG_HOST,
  ISOLATED_PG_PASSWORD,
  ISOLATED_PG_PORT,
  ISOLATED_PG_USER,
  isolatedSuiteRunAuthorized,
} from '../../src/credits/isolated-pg-guard';
import { VENUE_SIGNUP_BONUS_CREDITS } from '../../src/common/constants/credits';
import {
  confirmWelcomeCredit,
  historicalWelcomeCredits,
  linkHistoricalWelcomeClaim,
  recordWelcomeVenueProvision,
  reconcileHistoricalWelcomeClaims,
  reserveWelcomeCredit,
  welcomeCreditDocumentKey,
  welcomeCreditsForDocumentLink,
} from '../../src/credits/welcome-credit';
import { VenuesService } from '../../src/venues/venues.service';
import { ConfigService } from '@nestjs/config';
import { openIsolatedSession } from './session';

const SECRET = 'welcome-credit-hmac-test-secret-32';
const CPF = { documentType: 'CPF' as const, documentDigits: '12345678909' };
const CNPJ = { documentType: 'CNPJ' as const, documentDigits: '11444777000161' };
const KEY_CPF = welcomeCreditDocumentKey(SECRET, CPF);
const KEY_CNPJ = welcomeCreditDocumentKey(SECRET, CNPJ);

function disposableUrl(): string {
  const url = `postgresql://${ISOLATED_PG_USER}:${ISOLATED_PG_PASSWORD}@${ISOLATED_PG_HOST}:${ISOLATED_PG_PORT}/${ISOLATED_PG_DATABASE}?schema=public`;
  if (url !== 'postgresql://after_credit_ledger_test:disposable-local-only@127.0.0.1:55432/after_credit_ledger_test?schema=public') {
    throw new Error('destino PostgreSQL recusado');
  }
  return url;
}

const suite = isolatedSuiteRunAuthorized(process.env) ? describe : describe.skip;

suite('homologação PostgreSQL do crédito de boas-vindas', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const session = await openIsolatedSession();
    try {
      const rows = await session.query<{ current_database: string }>(
        'SELECT current_database() AS current_database',
      );
      if (rows[0]?.current_database !== ISOLATED_PG_DATABASE) {
        throw new Error('banco PostgreSQL recusado');
      }
    } finally {
      await session.close();
    }
    prisma = new PrismaClient({ datasources: { db: { url: disposableUrl() } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
  });

  async function cleanup() {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'wpg-' } } });
    await prisma.welcomeCreditClaim.deleteMany({});
  }

  function venuesService() {
    const config = {
      get: (key: string) => (key === 'WELCOME_CREDIT_HMAC_SECRET' ? SECRET : undefined),
    } as ConfigService;
    return new VenuesService(prisma as never, { deleteStoredUploads: jest.fn() } as never, undefined, config);
  }

  /** Conta legada já existente (antes do fim do bônus), para homologar vínculo histórico. */
  async function registerLegacyVenueWithPastWelcome(email: string) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: 'Legacy',
          email,
          passwordHash: 'not-a-password',
          role: 'VENUE',
          state: 'SP',
          city: 'Sao Paulo',
          ownedVenues: {
            create: {
              name: 'Legacy',
              city: 'Sao Paulo',
              state: 'SP',
              wallet: { create: { balance: 1, vipBalance: 0 } },
              purchases: {
                create: {
                  packageKey: 'welcome',
                  amountPaid: 0,
                  credits: 1,
                  status: 'PAID',
                },
              },
            },
          },
        },
        include: { ownedVenues: true },
      });
      const venueId = user.ownedVenues[0]?.id;
      if (!venueId) throw new Error('legacy venue missing');
      await recordWelcomeVenueProvision(tx, venueId);
      return { ...user, venueId };
    });
  }

  async function registerVenue(email: string, document = CPF) {
    return prisma.$transaction(async (tx) => {
      const reserved = await reserveWelcomeCredit(tx, document, SECRET);
      const owner = await tx.user.create({
        data: {
          name: 'Homologacao',
          email,
          passwordHash: 'not-a-password',
          role: 'VENUE',
          state: 'SP',
          city: 'Sao Paulo',
        },
      });
      await assertVenueDocumentAvailableForOwner(tx, owner.id, {
        documentType: document.documentType as VenueDocumentType,
        documentDigits: document.documentDigits,
      });
      const venue = await tx.venue.create({
        data: {
          ownerUserId: owner.id,
          name: 'Homologacao',
          city: 'Sao Paulo',
          state: 'SP',
          documentType: document.documentType as VenueDocumentType,
          documentDigits: document.documentDigits,
          wallet: { create: { balance: reserved ? 1 : 0, vipBalance: 0 } },
        },
      });
      if (reserved) {
        await confirmWelcomeCredit(tx, reserved.id, venue.id);
      }
      return { reserved: Boolean(reserved), userId: owner.id, venueId: venue.id };
    });
  }

  it('aplica o histórico e os índices únicos', async () => {
    const names = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name
    `;
    expect(names.length).toBeGreaterThanOrEqual(42);
    expect(names.map((row) => row.migration_name)).toEqual(
      expect.arrayContaining([
        '20261021170000_venue_document',
        '20261021200000_welcome_credit_claim',
        '20261021223000_welcome_credit_historical_source',
        '20261023120000_welcome_credit_venue_provision',
      ]),
    );
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'Venue_documentType_documentDigits_idx',
          'WelcomeCreditClaim_documentKey_key'
        )
    `;
    expect(indexes.map((row) => row.indexname).sort()).toEqual([
      'Venue_documentType_documentDigits_idx',
      'WelcomeCreditClaim_documentKey_key',
    ]);
  });

  it('cadastro novo via API não concede bônus (constante de signup zerada)', () => {
    expect(VENUE_SIGNUP_BONUS_CREDITS).toBe(0);
  });

  it('conta legada com welcome passado mantém provisão para vínculo histórico', async () => {
    const user = await registerLegacyVenueWithPastWelcome('wpg-legacy-mobile@example.test');
    const venueId = user.venueId;
    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { venueId } });
    const purchase = await prisma.creditPurchase.findFirstOrThrow({
      where: { venueId, packageKey: 'welcome' },
    });
    const provision = await prisma.welcomeCreditVenueProvision.findUniqueOrThrow({ where: { venueId } });
    expect(wallet.balance).toBe(1);
    expect(wallet.vipBalance).toBe(0);
    expect(purchase.credits).toBe(1);
    expect(provision.creditsGranted).toBe(1);
    expect(await prisma.welcomeCreditClaim.count()).toBe(0);
  });

  it('complementar documento após legacy vincula HISTORICAL sem alterar saldo', async () => {
    const user = await registerLegacyVenueWithPastWelcome('wpg-legacy-doc@example.test');
    const venueId = user.venueId;
    const balanceBefore = (await prisma.creditWallet.findUniqueOrThrow({ where: { venueId } })).balance;
    await venuesService().saveFiscalDocument(user.id, venueId, {
      documentType: 'CPF',
      documentNumber: '123.456.789-09',
    });
    const claim = await prisma.welcomeCreditClaim.findUniqueOrThrow({ where: { documentKey: KEY_CPF } });
    const balanceAfter = (await prisma.creditWallet.findUniqueOrThrow({ where: { venueId } })).balance;
    expect(claim.creditsGranted).toBe(1);
    expect(claim.source).toBe('HISTORICAL');
    expect(claim.originVenueId).toBe(venueId);
    expect(balanceAfter).toBe(balanceBefore);
    expect(await prisma.creditPurchase.count({ where: { venueId, packageKey: 'welcome' } })).toBe(1);
    const linkCredits = await prisma.$transaction(async (tx) => welcomeCreditsForDocumentLink(tx, venueId));
    expect(linkCredits).toBe(1);
    const again = await linkHistoricalWelcomeClaim(prisma, CPF, SECRET, venueId, 1);
    expect(again).toBe('already_claimed');
  });

  it('concede exatamente 1 crédito comum e vip zero', async () => {
    const created = await registerVenue('wpg-cpf@example.test');
    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { venueId: created.venueId! } });
    const purchase = await prisma.creditPurchase.findFirstOrThrow({
      where: { venueId: created.venueId!, packageKey: 'welcome' },
    });
    const claim = await prisma.welcomeCreditClaim.findUniqueOrThrow({ where: { documentKey: KEY_CPF } });
    expect(created.reserved).toBe(true);
    expect(wallet.balance).toBe(1);
    expect(wallet.vipBalance).toBe(0);
    expect(purchase.credits).toBe(1);
    expect(purchase.amountPaid.toNumber()).toBe(0);
    expect(purchase.provider).toBeNull();
    expect(claim.creditsGranted).toBe(1);
    expect(claim.source).toBe('SIGNUP');
    expect(claim.originVenueId).toBe(created.venueId);
  });

  it('dois cadastros simultâneos deixam um crédito e uma prova', async () => {
    const settled = await Promise.allSettled([
      registerVenue('wpg-a@example.test'),
      registerVenue('wpg-b@example.test'),
    ]);
    const fulfilled = settled.filter((item) => item.status === 'fulfilled');
    const rejected = settled.filter((item) => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const claims = await prisma.welcomeCreditClaim.findMany({ where: { documentKey: KEY_CPF } });
    const wallets = await prisma.creditWallet.findMany({
      where: { venue: { owner: { email: { startsWith: 'wpg-' } } } },
    });
    expect(claims).toHaveLength(1);
    expect(claims[0].creditsGranted).toBe(1);
    expect(claims[0].source).toBe('SIGNUP');
    expect(wallets).toHaveLength(1);
    expect(wallets[0].balance).toBe(1);
    expect(wallets[0].vipBalance).toBe(0);
  });

  it('falha no meio desfaz a prova e a conta', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const reserved = await reserveWelcomeCredit(tx, CPF, SECRET);
        expect(reserved).not.toBeNull();
        throw new Error('injected');
      }),
    ).rejects.toThrow('injected');
    expect(await prisma.welcomeCreditClaim.count({ where: { documentKey: KEY_CPF } })).toBe(0);
    expect(await prisma.user.count({ where: { email: { startsWith: 'wpg-' } } })).toBe(0);
  });

  it('a exclusão preserva a prova e o novo cadastro fica sem bônus', async () => {
    const created = await registerVenue('wpg-first@example.test');
    await prisma.user.delete({ where: { id: created.userId } });
    const surviving = await prisma.welcomeCreditClaim.findUniqueOrThrow({ where: { documentKey: KEY_CPF } });
    expect(surviving.originVenueId).toBe(created.venueId);
    expect(surviving.creditsGranted).toBe(1);
    expect(await prisma.venue.count({ where: { id: created.venueId! } })).toBe(0);
    expect(await prisma.creditPurchase.count({ where: { venueId: created.venueId! } })).toBe(0);

    const again = await registerVenue('wpg-second@example.test');
    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { venueId: again.venueId! } });
    expect(again.reserved).toBe(false);
    expect(wallet.balance).toBe(0);
    expect(wallet.vipBalance).toBe(0);
    expect(await prisma.creditPurchase.count({ where: { venueId: again.venueId!, packageKey: 'welcome' } })).toBe(0);
    expect(await prisma.welcomeCreditClaim.count({ where: { documentKey: KEY_CPF } })).toBe(1);
    expect(surviving.originVenueId).toBe(created.venueId);
  });

  it('vincula 2 créditos históricos sem alterar saldo nem compra real', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Antigo',
        email: 'wpg-old@example.test',
        passwordHash: 'not-a-password',
        role: 'VENUE',
        state: 'SP',
        city: 'Sao Paulo',
        ownedVenues: {
          create: {
            name: 'Antigo',
            city: 'Sao Paulo',
            state: 'SP',
            wallet: { create: { balance: 8, vipBalance: 4 } },
            purchases: {
              create: [
                { packageKey: 'welcome', amountPaid: 0, credits: 2, status: 'PAID' },
                { packageKey: 'combo_5', amountPaid: 149.9, credits: 5, status: 'PAID', provider: 'card' },
              ],
            },
          },
        },
      },
      include: { ownedVenues: true },
    });
    const venueId = user.ownedVenues[0]!.id;
    const linked = await prisma.$transaction(async (tx) => {
      const credits = await historicalWelcomeCredits(tx, venueId);
      const result = await linkHistoricalWelcomeClaim(tx, CPF, SECRET, venueId, credits);
      await tx.venue.update({
        where: { id: venueId },
        data: { documentType: 'CPF', documentDigits: CPF.documentDigits },
      });
      return { credits, result };
    });
    const repeated = await linkHistoricalWelcomeClaim(prisma, CPF, SECRET, 'wpg-other-origin', 2);
    const claim = await prisma.welcomeCreditClaim.findUniqueOrThrow({ where: { documentKey: KEY_CPF } });
    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { venueId } });
    const purchases = await prisma.creditPurchase.findMany({ where: { venueId }, orderBy: { packageKey: 'asc' } });
    expect(linked).toEqual({ credits: 2, result: 'linked' });
    expect(repeated).toBe('already_claimed');
    expect(claim.creditsGranted).toBe(2);
    expect(claim.source).toBe('HISTORICAL');
    expect(claim.originVenueId).toBe(venueId);
    expect(wallet).toEqual(expect.objectContaining({ balance: 8, vipBalance: 4 }));
    expect(purchases.map((row) => ({
      packageKey: row.packageKey,
      credits: row.credits,
      amount: row.amountPaid.toNumber(),
      provider: row.provider,
    }))).toEqual([
      { packageKey: 'combo_5', credits: 5, amount: 149.9, provider: 'card' },
      { packageKey: 'welcome', credits: 2, amount: 0, provider: null },
    ]);
  });

  it('reconciliação repetida não duplica nem mexe nos saldos', async () => {
    await prisma.user.create({
      data: {
        name: 'Com prova',
        email: 'wpg-reconcile@example.test',
        passwordHash: 'not-a-password',
        role: 'VENUE',
        state: 'SP',
        city: 'Sao Paulo',
        ownedVenues: {
          create: {
            name: 'Com prova',
            city: 'Sao Paulo',
            state: 'SP',
            documentType: 'CPF',
            documentDigits: CPF.documentDigits,
            wallet: { create: { balance: 8, vipBalance: 4 } },
            purchases: {
              create: [
                { packageKey: 'welcome', amountPaid: 0, credits: 2, status: 'PAID' },
                { packageKey: 'combo_5', amountPaid: 149.9, credits: 5, status: 'PAID', provider: 'card' },
              ],
            },
          },
        },
      },
    });
    await prisma.user.create({
      data: {
        name: 'Sem welcome',
        email: 'wpg-plain@example.test',
        passwordHash: 'not-a-password',
        role: 'VENUE',
        state: 'SP',
        city: 'Sao Paulo',
        ownedVenues: {
          create: {
            name: 'Sem welcome',
            city: 'Sao Paulo',
            state: 'SP',
            documentType: 'CNPJ',
            documentDigits: CNPJ.documentDigits,
            wallet: { create: { balance: 6, vipBalance: 2 } },
            purchases: { create: { packageKey: 'combo_5', amountPaid: 149.9, credits: 5, status: 'PAID', provider: 'pix' } },
          },
        },
      },
    });
    await prisma.user.create({
      data: {
        name: 'Sem documento',
        email: 'wpg-nodoc@example.test',
        passwordHash: 'not-a-password',
        role: 'VENUE',
        state: 'SP',
        city: 'Sao Paulo',
        ownedVenues: { create: { name: 'Sem documento', city: 'Sao Paulo', state: 'SP' } },
      },
    });

    const first = await reconcileHistoricalWelcomeClaims(prisma, SECRET);
    const second = await reconcileHistoricalWelcomeClaims(prisma, SECRET);
    const claim = await prisma.welcomeCreditClaim.findUniqueOrThrow({ where: { documentKey: KEY_CPF } });
    const wallets = await prisma.creditWallet.findMany({
      where: { venue: { owner: { email: { startsWith: 'wpg-' } } } },
      orderBy: { balance: 'asc' },
    });
    const realPurchase = await prisma.creditPurchase.findFirstOrThrow({
      where: { packageKey: 'combo_5', venue: { owner: { email: 'wpg-plain@example.test' } } },
    });
    expect(first.linked).toBeGreaterThanOrEqual(1);
    expect(second.linked).toBe(0);
    expect(second.alreadyClaimed).toBeGreaterThanOrEqual(first.linked);
    expect(JSON.stringify(first)).not.toContain(CPF.documentDigits);
    expect(claim.creditsGranted).toBe(2);
    expect(claim.source).toBe('HISTORICAL');
    expect(wallets.map((row) => ({ balance: row.balance, vipBalance: row.vipBalance }))).toEqual([
      { balance: 6, vipBalance: 2 },
      { balance: 8, vipBalance: 4 },
    ]);
    expect(realPurchase.credits).toBe(5);
    expect(realPurchase.amountPaid.toNumber()).toBe(149.9);
    expect(realPurchase.provider).toBe('pix');
    expect(await prisma.welcomeCreditClaim.count({ where: { documentKey: KEY_CNPJ } })).toBe(0);
  });

  it('as constraints reais separam SIGNUP de HISTORICAL', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "WelcomeCreditClaim"
          ("id", "documentKey", "documentType", "creditsGranted", "source")
        VALUES (${'wpg-row-signup-2'}, ${'wpg-signup-2'}, 'CPF'::"VenueDocumentType", ${2}, 'SIGNUP'::"WelcomeCreditSource")
      `,
    ).rejects.toThrow(/WelcomeCreditClaim_credits_source_check|23514/);
    await expect(
      prisma.$executeRaw`
        INSERT INTO "WelcomeCreditClaim"
          ("id", "documentKey", "documentType", "creditsGranted", "source")
        VALUES (${'wpg-row-historical-0'}, ${'wpg-historical-0'}, 'CPF'::"VenueDocumentType", ${0}, 'HISTORICAL'::"WelcomeCreditSource")
      `,
    ).rejects.toThrow(/WelcomeCreditClaim_credits_source_check|23514/);
    await prisma.$executeRaw`
      INSERT INTO "WelcomeCreditClaim"
        ("id", "documentKey", "documentType", "creditsGranted", "source")
      VALUES (${'wpg-row-signup-1'}, ${'wpg-signup-1'}, 'CPF'::"VenueDocumentType", ${1}, 'SIGNUP'::"WelcomeCreditSource")
    `;
    await prisma.$executeRaw`
      INSERT INTO "WelcomeCreditClaim"
        ("id", "documentKey", "documentType", "creditsGranted", "source")
      VALUES (${'wpg-row-historical-2'}, ${'wpg-historical-2'}, 'CNPJ'::"VenueDocumentType", ${2}, 'HISTORICAL'::"WelcomeCreditSource")
    `;
    const rows = await prisma.welcomeCreditClaim.findMany({
      where: { documentKey: { in: ['wpg-signup-1', 'wpg-historical-2'] } },
      orderBy: { documentKey: 'asc' },
    });
    expect(rows.map((row) => ({ key: row.documentKey, credits: row.creditsGranted, source: row.source }))).toEqual([
      { key: 'wpg-historical-2', credits: 2, source: 'HISTORICAL' },
      { key: 'wpg-signup-1', credits: 1, source: 'SIGNUP' },
    ]);
  });

  it('o índice do documento ativo impede outra conta e não move a origem', async () => {
    const first = await registerVenue('wpg-owner@example.test');
    const intruder = await prisma.user.create({
      data: {
        name: 'Outra',
        email: 'wpg-taken@example.test',
        passwordHash: 'not-a-password',
        role: 'VENUE',
        state: 'SP',
        city: 'Sao Paulo',
      },
    });
    await expect(
      prisma.$transaction((tx) =>
        assertVenueDocumentAvailableForOwner(tx, intruder.id, {
          documentType: VenueDocumentType.CPF,
          documentDigits: CPF.documentDigits,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const unchanged = await linkHistoricalWelcomeClaim(prisma, CPF, SECRET, 'wpg-should-not-replace', 2);
    const claim = await prisma.welcomeCreditClaim.findUniqueOrThrow({ where: { documentKey: KEY_CPF } });
    expect(unchanged).toBe('already_claimed');
    expect(claim.originVenueId).toBe(first.venueId);
    expect(claim.creditsGranted).toBe(1);
    expect(claim.source).toBe('SIGNUP');
    expect(await prisma.creditWallet.count({ where: { balance: 9 } })).toBe(0);
  });
});
