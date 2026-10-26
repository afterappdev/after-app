import {
  AccountLifecycleStatus,
  PurchaseStatus,
} from '@prisma/client';
import {
  assessFinancialPurge,
  listFinancialPurgeBlockers,
} from '../../src/users/account-purge.financial';
import { UsersService } from '../../src/users/users.service';
import { AccountLifecycleService } from '../../src/users/account-lifecycle.service';
import {
  cleanupSoftDeleteFixtures,
  createVenueOwner,
  openIsolatedPrisma,
  seedOpenObligation,
  seedPurchase,
  softDeleteSuiteEnabled,
} from './soft-delete.harness';

const suite = softDeleteSuiteEnabled() ? describe : describe.skip;

const mediaMock = {
  deleteStoredUpload: jest.fn(),
  deleteStoredUploads: jest.fn(),
  deleteStoredUploadsWithReport: jest.fn().mockResolvedValue({
    attempted: 0,
    removed: 0,
    failedUrls: [],
  }),
};
const appleMock = { revokeForAccount: jest.fn().mockResolvedValue(undefined) };

suite('soft delete financial retention (isolated postgres)', () => {
  afterEach(async () => {
    const prisma = await openIsolatedPrisma();
    try {
      await cleanupSoftDeleteFixtures(prisma);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('blockers por cenário de compra e obrigação', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const { userId, venueId } = await createVenueOwner(prisma);
      await seedPurchase(prisma, venueId, { status: PurchaseStatus.PAID });
      let blockers = await listFinancialPurgeBlockers(prisma as never, userId);
      expect(blockers).not.toContain('credit_obligation_open');

      await seedOpenObligation(prisma, venueId);
      blockers = await listFinancialPurgeBlockers(prisma as never, userId);
      expect(blockers).toContain('credit_obligation_open');

      await seedPurchase(prisma, venueId, {
        status: PurchaseStatus.PENDING,
        providerTxId: 'tx-123',
      });
      blockers = await listFinancialPurgeBlockers(prisma as never, userId);
      expect(blockers).toContain('purchase_settlement_pending');

      await seedPurchase(prisma, venueId, {
        status: PurchaseStatus.PENDING,
        providerTxId: null,
        createdAt: new Date(),
      });
      blockers = await listFinancialPurgeBlockers(prisma as never, userId);
      expect(blockers).toContain('purchase_pending_recent');

      await seedPurchase(prisma, venueId, {
        status: PurchaseStatus.PENDING,
        provider: 'pix',
        providerTxId: null,
        createdAt: new Date('2020-01-01'),
      });
      blockers = await listFinancialPurgeBlockers(prisma as never, userId);
      expect(blockers).toContain('purchase_pending_stale_with_provider');

      await seedPurchase(prisma, venueId, {
        status: PurchaseStatus.FAILED,
        providerTxId: null,
      });
      await seedPurchase(prisma, venueId, {
        status: PurchaseStatus.CANCELLED,
        providerTxId: null,
      });
      await assessFinancialPurge(prisma as never, userId);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('tombstone PURGED preserva compras e anonimiza fiscal', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const { userId, venueId } = await createVenueOwner(prisma);
      await seedOpenObligation(prisma, venueId);
      const purchase = await prisma.creditPurchase.findFirstOrThrow({
        where: { venueId },
      });
      const users = new UsersService(
        prisma as never,
        mediaMock as never,
        appleMock as never,
        new AccountLifecycleService(prisma as never),
      );
      await users.anonymizeFinancialRetention(userId);
      const anonymized = await prisma.creditPurchase.findUniqueOrThrow({
        where: { id: purchase.id },
      });
      expect(anonymized.fiscalDocument).toBeNull();

      const outcome = await users.finalizePermanentUserRemoval(userId);
      expect(outcome).toBe('tombstoned');
      const stillThere = await prisma.creditPurchase.count({
        where: { id: purchase.id },
      });
      expect(stillThere).toBe(1);
      const tomb = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(tomb.accountStatus).toBe(AccountLifecycleStatus.PURGED);
      expect(tomb.email).toContain('purged+');
      const second = await users.finalizePermanentUserRemoval(userId);
      expect(second).toBe('tombstoned');
    } finally {
      await prisma.$disconnect();
    }
  });
});
