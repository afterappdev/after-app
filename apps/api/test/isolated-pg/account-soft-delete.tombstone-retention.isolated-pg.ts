import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
  PurchaseStatus,
} from '@prisma/client';
import { AuthService } from '../../src/auth/auth.service';
import { AccountPurgeAuditService } from '../../src/users/account-purge.audit';
import { AccountPermanentPurgeExecutorImpl } from '../../src/users/account-purge.executor.impl';
import { AccountPurgeStore } from '../../src/users/account-purge.store';
import { PURGE_PROGRESS } from '../../src/users/account-purge.progress';
import { UploadPurgeIncompleteError } from '../../src/users/account-purge.upload';
import { AccountLifecycleService } from '../../src/users/account-lifecycle.service';
import { UsersService } from '../../src/users/users.service';
import {
  cleanupSoftDeleteFixtures,
  createVenueOwner,
  openIsolatedPrisma,
  seedLedgerEntry,
  seedOpenObligation,
  seedPurchase,
  seedVipCreditEntry,
  softDeleteSuiteEnabled,
} from './soft-delete.harness';

const suite = softDeleteSuiteEnabled() ? describe : describe.skip;

const mediaMock = () => ({
  deleteStoredUploadWithReport: jest.fn(),
  deleteStoredUploadsWithReport: jest
    .fn()
    .mockResolvedValueOnce({
      attempted: 1,
      removed: 0,
      failedUrls: ['https://isolated.test/tomb-cover.png'],
    })
    .mockResolvedValueOnce({
      attempted: 1,
      removed: 1,
      failedUrls: [],
    }),
});

suite('soft delete tombstone + financial retention (isolated postgres)', () => {
  afterEach(async () => {
    const prisma = await openIsolatedPrisma();
    try {
      await cleanupSoftDeleteFixtures(prisma);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('fixtures financeiras, PURGED, PII removido, ledger/VIP/wallet preservados', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const { userId, venueId, email } = await createVenueOwner(prisma);
      await seedOpenObligation(prisma, venueId);
      const paid = await seedPurchase(prisma, venueId, {
        status: PurchaseStatus.PAID,
        fiscalDocument: '99988877766',
      });
      await seedLedgerEntry(prisma, venueId, paid.id);
      await seedVipCreditEntry(prisma, venueId, `vip_${paid.id}`);
      const walletBefore = await prisma.creditWallet.findUniqueOrThrow({
        where: { venueId },
      });

      const users = new UsersService(
        prisma as never,
        mediaMock() as never,
        { revokeForAccount: jest.fn().mockResolvedValue(undefined) } as never,
        new AccountLifecycleService(prisma as never),
      );
      await users.anonymizeFinancialRetention(userId);
      const outcome = await users.finalizePermanentUserRemoval(userId);
      expect(outcome).toBe('tombstoned');

      const tomb = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(tomb.accountStatus).toBe(AccountLifecycleStatus.PURGED);
      expect(tomb.email).toMatch(/^purged\+/);
      expect(tomb.name).not.toContain('@isolated.test');
      expect(
        await prisma.creditPurchase.count({ where: { venueId } }),
      ).toBeGreaterThanOrEqual(2);
      expect(
        await prisma.creditObligation.count({ where: { venueId } }),
      ).toBe(1);
      expect(
        await prisma.creditLedgerEntry.count({ where: { venueId } }),
      ).toBe(1);
      expect(
        await prisma.vipCreditEntry.count({ where: { venueId } }),
      ).toBe(1);
      const walletAfter = await prisma.creditWallet.findUniqueOrThrow({
        where: { venueId },
      });
      expect(walletAfter.balance).toBe(walletBefore.balance);

      const anonymized = await prisma.creditPurchase.findFirst({
        where: { id: paid.id },
      });
      expect(anonymized?.fiscalDocument).toBeNull();

      expect(tomb.email).not.toContain('@isolated.test');
      expect(tomb.email).toContain('@deleted.after.local');

      const auth = new AuthService(
        prisma as never,
        { sign: jest.fn() } as never,
        { get: () => undefined, getOrThrow: () => 'jwt' } as never,
      );
      await expect(
        auth.login({ email, password: 'isolated-only' }),
      ).rejects.toThrow(/Credenciais inválidas/);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('upload falha após tombstone, retry preserva manifesto e conclui', async () => {
    const prisma = await openIsolatedPrisma();
    const media = mediaMock();
    try {
      const past = new Date(Date.now() - 2 * 86400000);
      const now = new Date();
      const manifest = ['https://isolated.test/tomb-cover.png'];
      const { userId, venueId } = await createVenueOwner(prisma);
      await seedOpenObligation(prisma, venueId);
      await prisma.venue.update({
        where: { id: venueId },
        data: { coverUrl: manifest[0] },
      });
      const users = new UsersService(
        prisma as never,
        media as never,
        { revokeForAccount: jest.fn().mockResolvedValue(undefined) } as never,
        new AccountLifecycleService(prisma as never),
      );
      await users.anonymizeFinancialRetention(userId);
      await users.finalizePermanentUserRemoval(userId);

      const job = await prisma.accountPurgeJob.create({
        data: {
          userId,
          status: AccountPurgeJobStatus.FAILED,
          scheduledFor: past,
          progressStage: PURGE_PROGRESS.DATA,
          uploadManifest: manifest,
          lastError: 'upload_purge_incomplete',
          attempts: 1,
        },
      });
      const store = new AccountPurgeStore(prisma as never);
      const executor = new AccountPermanentPurgeExecutorImpl(
        prisma as never,
        users,
        media as never,
        store,
        new AccountPurgeAuditService(),
      );
      const claimed = await store.tryClaimJob(job.id, 'tomb-a', now, 60_000);
      await expect(
        executor.executePermanentPurge(userId, {
          jobId: job.id,
          workerId: 'tomb-a',
          leaseEpoch: claimed!.leaseEpoch,
          renewLease: () =>
            store.renewLease(job.id, 'tomb-a', claimed!.leaseEpoch, now, 60_000),
        }),
      ).rejects.toBeInstanceOf(UploadPurgeIncompleteError);

      const failed = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(failed.uploadManifest).toEqual(manifest);
      expect(
        (
          await prisma.user.findUniqueOrThrow({ where: { id: userId } })
        ).accountStatus,
      ).toBe(AccountLifecycleStatus.PURGED);

      await store.markFailed(
        job.id,
        'tomb-a',
        claimed!.leaseEpoch,
        'upload_purge_incomplete',
        now,
      );
      const reclaimed = await store.tryClaimJob(job.id, 'tomb-b', now, 60_000);
      await executor.executePermanentPurge(userId, {
        jobId: job.id,
        workerId: 'tomb-b',
        leaseEpoch: reclaimed!.leaseEpoch,
        renewLease: () =>
          store.renewLease(job.id, 'tomb-b', reclaimed!.leaseEpoch, now, 60_000),
      });
      const done = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(done.progressStage).toBe(PURGE_PROGRESS.DONE);
      expect(media.deleteStoredUploadsWithReport).toHaveBeenCalledTimes(2);
    } finally {
      await prisma.$disconnect();
    }
  });
});
