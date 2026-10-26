import { randomBytes } from 'crypto';
import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
  PrismaClient,
  Role,
  PurchaseStatus,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import {
  ISOLATED_PG_DATABASE,
  ISOLATED_PG_HOST,
  ISOLATED_PG_PASSWORD,
  ISOLATED_PG_PORT,
  ISOLATED_PG_USER,
  assertIsolatedPgTarget,
  isolatedPgTargetFromDedicatedEnv,
  isolatedSuiteRunAuthorized,
} from '../../src/credits/isolated-pg-guard';

const EMAIL_DOMAIN = '@isolated.test';

export function softDeleteSuiteEnabled(): boolean {
  return isolatedSuiteRunAuthorized(process.env);
}

export function assertSoftDeleteIsolatedTarget(): void {
  assertIsolatedPgTarget(isolatedPgTargetFromDedicatedEnv(process.env));
}

export function buildIsolatedDatabaseUrl(): string {
  assertSoftDeleteIsolatedTarget();
  const url = `postgresql://${ISOLATED_PG_USER}:${ISOLATED_PG_PASSWORD}@${ISOLATED_PG_HOST}:${ISOLATED_PG_PORT}/${ISOLATED_PG_DATABASE}?schema=public`;
  if (!url.includes('127.0.0.1:55432/after_credit_ledger_test')) {
    throw new Error('DATABASE_URL isolation check failed');
  }
  if (/railway|rlwy|amazonaws|neon|supabase|render\.com/i.test(url)) {
    throw new Error('DATABASE_URL host refused');
  }
  return url;
}

export async function openIsolatedPrisma(): Promise<PrismaClient> {
  const url = buildIsolatedDatabaseUrl();
  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });
  await prisma.$connect();
  return prisma;
}

export function uniqueTag(): string {
  return `sdiso_${randomBytes(6).toString('hex')}`;
}

export async function createActiveUser(
  prisma: PrismaClient,
  role: Role = Role.USER,
): Promise<{ id: string; email: string }> {
  const tag = uniqueTag();
  const email = `${tag}${EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      name: `Isolated ${tag}`,
      email,
      passwordHash: await bcrypt.hash('isolated-only', 4),
      role,
      state: 'SP',
      city: 'São Paulo',
      accountStatus: AccountLifecycleStatus.ACTIVE,
      sessionVersion: 0,
    },
    select: { id: true, email: true },
  });
  return user;
}

export async function createVenueOwner(
  prisma: PrismaClient,
): Promise<{ userId: string; venueId: string; email: string }> {
  const tag = uniqueTag();
  const email = `${tag}${EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      name: `Venue ${tag}`,
      email,
      passwordHash: await bcrypt.hash('isolated-only', 4),
      role: Role.VENUE,
      state: 'SP',
      city: 'São Paulo',
      accountStatus: AccountLifecycleStatus.ACTIVE,
      sessionVersion: 0,
      venue: {
        create: {
          name: `Bar ${tag}`,
          city: 'São Paulo',
          state: 'SP',
          wallet: { create: { balance: 0, vipBalance: 0 } },
        },
      },
    },
    select: {
      id: true,
      email: true,
      venue: { select: { id: true } },
    },
  });
  return {
    userId: user.id,
    venueId: user.venue!.id,
    email: user.email,
  };
}

export async function seedPurchase(
  prisma: PrismaClient,
  venueId: string,
  data: {
    status: PurchaseStatus;
    provider?: string | null;
    providerTxId?: string | null;
    createdAt?: Date;
    fiscalDocument?: string | null;
  },
) {
  return prisma.creditPurchase.create({
    data: {
      venueId,
      packageKey: 'isolated_pkg',
      amountPaid: 19.9,
      credits: 100,
      status: data.status,
      provider: data.provider ?? null,
      providerTxId: data.providerTxId ?? null,
      createdAt: data.createdAt ?? new Date(),
      fiscalDocument: data.fiscalDocument ?? '12345678901',
      fiscalName: 'Titular Teste',
    },
  });
}

export async function seedOpenObligation(
  prisma: PrismaClient,
  venueId: string,
) {
  const purchase = await seedPurchase(prisma, venueId, {
    status: PurchaseStatus.PAID,
  });
  await prisma.creditObligation.create({
    data: {
      venueId,
      purchaseId: purchase.id,
      creditsOriginal: 100,
      creditsRecovered: 60,
      creditsOpened: 40,
      creditsSettled: 0,
      status: 'open',
      source: 'pix_full_refund',
    },
  });
  return purchase;
}

export async function cleanupSoftDeleteFixtures(
  prisma: PrismaClient,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: EMAIL_DOMAIN } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  await prisma.accountPurgeJob.deleteMany({ where: { userId: { in: ids } } });
  const venues = await prisma.venue.findMany({
    where: { ownerUserId: { in: ids } },
    select: { id: true },
  });
  const venueIds = venues.map((v) => v.id);
  if (venueIds.length > 0) {
    await prisma.creditLedgerEntry.deleteMany({
      where: { venueId: { in: venueIds } },
    });
    await prisma.creditObligation.deleteMany({
      where: { venueId: { in: venueIds } },
    });
    await prisma.creditRefundAudit.deleteMany({
      where: { venueId: { in: venueIds } },
    });
    await prisma.vipCreditEntry.deleteMany({
      where: { venueId: { in: venueIds } },
    });
    await prisma.creditPurchase.deleteMany({
      where: { venueId: { in: venueIds } },
    });
    await prisma.creditWallet.deleteMany({
      where: { venueId: { in: venueIds } },
    });
  }
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

export async function seedLedgerEntry(
  prisma: PrismaClient,
  venueId: string,
  purchaseId: string,
) {
  return prisma.creditLedgerEntry.create({
    data: {
      venueId,
      purchaseId,
      operationKey: `ledger_${uniqueTag()}`,
      kind: 'purchase_grant',
      credits: 100,
      availableDelta: 100,
      debtDelta: 0,
    },
  });
}

export async function seedVipCreditEntry(
  prisma: PrismaClient,
  venueId: string,
  operationKey: string,
) {
  return prisma.vipCreditEntry.create({
    data: {
      venueId,
      operationKey,
      kind: 'grant',
      credits: 10,
      balanceDelta: 10,
    },
  });
}

export async function scheduleJobDirect(
  prisma: PrismaClient,
  userId: string,
  scheduledFor: Date,
  status: AccountPurgeJobStatus = AccountPurgeJobStatus.PENDING,
) {
  return prisma.accountPurgeJob.upsert({
    where: { userId },
    create: { userId, scheduledFor, status },
    update: { scheduledFor, status, cancelledAt: null, completedAt: null },
  });
}
