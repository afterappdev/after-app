import { ConflictException } from '@nestjs/common';
import { PrismaClient, Role, VenueDocumentType } from '@prisma/client';
import { execSync } from 'child_process';
import { join } from 'path';
import {
  ISOLATED_PG_DATABASE,
  ISOLATED_PG_HOST,
  ISOLATED_PG_PASSWORD,
  ISOLATED_PG_PORT,
  ISOLATED_PG_USER,
  isolatedSuiteRunAuthorized,
} from '../../src/credits/isolated-pg-guard';
import { assertVenueDocumentAvailableForOwner } from '../../src/venues/venue-document-policy';
import { assertVenueOwned } from '../../src/venues/venue-ownership';
import { VenuesService } from '../../src/venues/venues.service';
import { VENUE_SIGNUP_BONUS_CREDITS } from '../../src/common/constants/credits';

const suite = isolatedSuiteRunAuthorized(process.env) ? describe : describe.skip;

const CNPJ = '11444777000161';

function disposableUrl() {
  return `postgresql://${ISOLATED_PG_USER}:${encodeURIComponent(ISOLATED_PG_PASSWORD)}@${ISOLATED_PG_HOST}:${ISOLATED_PG_PORT}/${ISOLATED_PG_DATABASE}?schema=public`;
}

suite('multi-venue schema (disposable PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const apiRoot = join(__dirname, '..', '..');
    execSync('npx prisma migrate deploy', {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: disposableUrl() },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasources: { db: { url: disposableUrl() } } });
    await prisma.$connect();
    await prisma.venue.deleteMany({
      where: { documentDigits: { in: [CNPJ, '12345678000199'] } },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('allows two venues with the same CNPJ for one owner', async () => {
    const owner = await prisma.user.create({
      data: {
        name: 'Owner Multi',
        email: `multi-owner-${Date.now()}@after.local`,
        passwordHash: 'x',
        role: Role.VENUE,
        state: 'SP',
        city: 'São Paulo',
      },
    });
    const v1 = await prisma.venue.create({
      data: {
        ownerUserId: owner.id,
        name: 'Bar A',
        city: 'São Paulo',
        state: 'SP',
        documentType: VenueDocumentType.CNPJ,
        documentDigits: CNPJ,
      },
    });
    await prisma.$transaction(async (tx) => {
      await assertVenueDocumentAvailableForOwner(tx, owner.id, {
        documentType: VenueDocumentType.CNPJ,
        documentDigits: CNPJ,
      });
    });
    const v2 = await prisma.venue.create({
      data: {
        ownerUserId: owner.id,
        name: 'Bar B',
        city: 'São Paulo',
        state: 'SP',
        documentType: VenueDocumentType.CNPJ,
        documentDigits: CNPJ,
      },
    });
    expect(v1.id).not.toBe(v2.id);
  });

  it('blocks the same CNPJ for a different owner', async () => {
    const other = await prisma.user.create({
      data: {
        name: 'Other Owner',
        email: `other-owner-${Date.now()}@after.local`,
        passwordHash: 'x',
        role: Role.VENUE,
        state: 'SP',
        city: 'São Paulo',
      },
    });
    await prisma.venue.create({
      data: {
        ownerUserId: other.id,
        name: 'Existing',
        city: 'São Paulo',
        state: 'SP',
        documentType: VenueDocumentType.CNPJ,
        documentDigits: CNPJ,
      },
    });
    const intruder = await prisma.user.create({
      data: {
        name: 'Intruder',
        email: `intruder-${Date.now()}@after.local`,
        passwordHash: 'x',
        role: Role.VENUE,
        state: 'SP',
        city: 'São Paulo',
      },
    });
    await expect(
      prisma.$transaction((tx) =>
        assertVenueDocumentAvailableForOwner(tx, intruder.id, {
          documentType: VenueDocumentType.CNPJ,
          documentDigits: CNPJ,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores activeVenueId on user', async () => {
    const owner = await prisma.user.create({
      data: {
        name: 'Active Pick',
        email: `active-${Date.now()}@after.local`,
        passwordHash: 'x',
        role: Role.VENUE,
        state: 'SP',
        city: 'São Paulo',
      },
    });
    const venue = await prisma.venue.create({
      data: {
        ownerUserId: owner.id,
        name: 'Pick Me',
        city: 'São Paulo',
        state: 'SP',
      },
    });
    const updated = await prisma.user.update({
      where: { id: owner.id },
      data: { activeVenueId: venue.id },
      select: { activeVenueId: true },
    });
    expect(updated.activeVenueId).toBe(venue.id);
  });

  it('keeps independent credit wallets per venue', async () => {
    const owner = await prisma.user.create({
      data: {
        name: 'Wallet Owner',
        email: `wallets-${Date.now()}@after.local`,
        passwordHash: 'x',
        role: Role.VENUE,
        state: 'SP',
        city: 'São Paulo',
      },
    });
    const v1 = await prisma.venue.create({
      data: {
        ownerUserId: owner.id,
        name: 'A',
        city: 'São Paulo',
        state: 'SP',
        wallet: { create: { balance: 3, vipBalance: 1 } },
      },
      include: { wallet: true },
    });
    const v2 = await prisma.venue.create({
      data: {
        ownerUserId: owner.id,
        name: 'B',
        city: 'São Paulo',
        state: 'SP',
        wallet: { create: { balance: 7, vipBalance: 2 } },
      },
      include: { wallet: true },
    });
    expect(v1.wallet?.balance).toBe(3);
    expect(v2.wallet?.balance).toBe(7);
    await prisma.creditWallet.update({
      where: { venueId: v1.id },
      data: { balance: { decrement: 1 } },
    });
    const after = await prisma.creditWallet.findUnique({
      where: { venueId: v2.id },
    });
    expect(after?.balance).toBe(7);
  });

  it('rejects access to another user venue', async () => {
    const owner = await prisma.user.create({
      data: {
        name: 'Real Owner',
        email: `real-${Date.now()}@after.local`,
        passwordHash: 'x',
        role: Role.VENUE,
        state: 'SP',
        city: 'São Paulo',
      },
    });
    const intruder = await prisma.user.create({
      data: {
        name: 'Intruder',
        email: `intruder-venue-${Date.now()}@after.local`,
        passwordHash: 'x',
        role: Role.VENUE,
        state: 'SP',
        city: 'São Paulo',
      },
    });
    const venue = await prisma.venue.create({
      data: {
        ownerUserId: owner.id,
        name: 'Private',
        city: 'São Paulo',
        state: 'SP',
      },
    });
    await expect(
      assertVenueOwned(prisma, intruder.id, venue.id),
    ).rejects.toThrow();
    await expect(
      assertVenueOwned(prisma, owner.id, venue.id),
    ).resolves.toBeUndefined();
  });

  it('serializes concurrent document claims for different owners', async () => {
    const doc = { documentType: VenueDocumentType.CNPJ, documentDigits: '12345678000199' };
    const a = await prisma.user.create({
      data: {
        name: 'Race A',
        email: `race-a-${Date.now()}@after.local`,
        passwordHash: 'x',
        role: Role.VENUE,
        state: 'SP',
        city: 'São Paulo',
      },
    });
    const b = await prisma.user.create({
      data: {
        name: 'Race B',
        email: `race-b-${Date.now()}@after.local`,
        passwordHash: 'x',
        role: Role.VENUE,
        state: 'SP',
        city: 'São Paulo',
      },
    });
    await prisma.$transaction(async (tx) => {
      await assertVenueDocumentAvailableForOwner(tx, a.id, doc);
      await tx.venue.create({
        data: {
          ownerUserId: a.id,
          name: 'First',
          city: 'São Paulo',
          state: 'SP',
          documentType: doc.documentType,
          documentDigits: doc.documentDigits,
        },
      });
    });
    await expect(
      prisma.$transaction((tx) =>
        assertVenueDocumentAvailableForOwner(tx, b.id, doc),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not auto-grant welcome credits on first or second owned venue', async () => {
    expect(VENUE_SIGNUP_BONUS_CREDITS).toBe(0);
    const owner = await prisma.user.create({
      data: {
        name: 'No Bonus Owner',
        email: `no-bonus-${Date.now()}@after.local`,
        passwordHash: 'x',
        role: Role.VENUE,
        state: 'SP',
        city: 'São Paulo',
      },
    });
    const first = await prisma.venue.create({
      data: {
        ownerUserId: owner.id,
        name: 'First Zero',
        city: 'São Paulo',
        state: 'SP',
        wallet: { create: { balance: 0, vipBalance: 0 } },
      },
    });
    const venuesService = new VenuesService(
      prisma as never,
      { deleteStoredUploads: jest.fn() } as never,
      undefined,
      undefined,
    );
    const second = await venuesService.createOwnedVenue(owner.id, {
      name: 'Second Zero',
      city: 'São Paulo',
      state: 'SP',
    });
    const w1 = await prisma.creditWallet.findUnique({ where: { venueId: first.id } });
    const w2 = await prisma.creditWallet.findUnique({ where: { venueId: second.id } });
    expect(w1).toEqual(expect.objectContaining({ balance: 0, vipBalance: 0 }));
    expect(w2).toEqual(expect.objectContaining({ balance: 0, vipBalance: 0 }));
    expect(
      await prisma.creditPurchase.count({
        where: { venueId: { in: [first.id, second.id] }, packageKey: 'welcome' },
      }),
    ).toBe(0);
  });
});
