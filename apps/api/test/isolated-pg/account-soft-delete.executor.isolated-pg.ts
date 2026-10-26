import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
} from '@prisma/client';
import { AccountPurgeAuditService } from '../../src/users/account-purge.audit';
import { AccountPermanentPurgeExecutorImpl } from '../../src/users/account-purge.executor.impl';
import { AccountPurgeStore } from '../../src/users/account-purge.store';
import { PURGE_PROGRESS } from '../../src/users/account-purge.progress';
import { UploadPurgeIncompleteError } from '../../src/users/account-purge.upload';
import { AccountLifecycleService } from '../../src/users/account-lifecycle.service';
import { UsersService } from '../../src/users/users.service';
import {
  cleanupSoftDeleteFixtures,
  createActiveUser,
  openIsolatedPrisma,
  scheduleJobDirect,
  softDeleteSuiteEnabled,
} from './soft-delete.harness';

const suite = softDeleteSuiteEnabled() ? describe : describe.skip;

function buildUsers(prisma: Awaited<ReturnType<typeof openIsolatedPrisma>>) {
  return new UsersService(
    prisma as never,
    {
      deleteStoredUploadsWithReport: jest.fn().mockResolvedValue({
        attempted: 1,
        removed: 1,
        failedUrls: [],
      }),
    } as never,
    { revokeForAccount: jest.fn().mockResolvedValue(undefined) } as never,
    new AccountLifecycleService(prisma as never),
  );
}

suite('soft delete executor (isolated postgres, R2 mocked)', () => {
  afterEach(async () => {
    const prisma = await openIsolatedPrisma();
    try {
      await cleanupSoftDeleteFixtures(prisma);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('hard delete completo: manifesto, progresso DONE, user removido', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const store = new AccountPurgeStore(prisma as never);
      const users = buildUsers(prisma);
      const media = {
        deleteStoredUploadsWithReport: jest.fn().mockResolvedValue({
          attempted: 0,
          removed: 0,
          failedUrls: [],
        }),
      };
      const executor = new AccountPermanentPurgeExecutorImpl(
        prisma as never,
        users,
        media as never,
        store,
        new AccountPurgeAuditService(),
      );
      const past = new Date(Date.now() - 2 * 86400000);
      const now = new Date();
      const { id: userId } = await createActiveUser(prisma);
      await prisma.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          permanentDeletionAt: past,
          avatarUrl: 'https://isolated.test/mock-avatar.png',
        },
      });
      const job = await scheduleJobDirect(prisma, userId, past);
      const claimed = await store.tryClaimJob(job.id, 'exec-worker', now, 300_000);
      expect(claimed?.leaseEpoch).toBe(1);

      await executor.executePermanentPurge(userId, {
        jobId: job.id,
        workerId: 'exec-worker',
        leaseEpoch: claimed!.leaseEpoch,
        renewLease: () =>
          store.renewLease(job.id, 'exec-worker', claimed!.leaseEpoch, now, 300_000),
      });

      const row = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(row.progressStage).toBe(PURGE_PROGRESS.DONE);
      expect(
        await store.markCompleted(
          job.id,
          'exec-worker',
          claimed!.leaseEpoch,
          now,
        ),
      ).toBe(true);
      expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('retomada após FAILED preserva manifesto e conclui', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const store = new AccountPurgeStore(prisma as never);
      const users = buildUsers(prisma);
      const media = {
        deleteStoredUploadsWithReport: jest.fn().mockResolvedValue({
          attempted: 1,
          removed: 1,
          failedUrls: [],
        }),
      };
      const executor = new AccountPermanentPurgeExecutorImpl(
        prisma as never,
        users,
        media as never,
        store,
        new AccountPurgeAuditService(),
      );
      const past = new Date(Date.now() - 2 * 86400000);
      const now = new Date();
      const { id: userId } = await createActiveUser(prisma);
      await prisma.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          permanentDeletionAt: past,
        },
      });
      const job = await scheduleJobDirect(prisma, userId, past);
      const manifest = ['https://isolated.test/file-a.png'];
      await prisma.accountPurgeJob.update({
        where: { id: job.id },
        data: {
          status: AccountPurgeJobStatus.FAILED,
          progressStage: PURGE_PROGRESS.MANIFEST,
          uploadManifest: manifest,
          lockedBy: null,
          lockedUntil: null,
          lastError: 'upload_purge_incomplete',
        },
      });
      const reclaimed = await store.tryClaimJob(job.id, 'retry-worker', now, 120_000);
      expect(reclaimed?.leaseEpoch).toBeGreaterThan(0);

      await executor.executePermanentPurge(userId, {
        jobId: job.id,
        workerId: 'retry-worker',
        leaseEpoch: reclaimed!.leaseEpoch,
        renewLease: () =>
          store.renewLease(
            job.id,
            'retry-worker',
            reclaimed!.leaseEpoch,
            now,
            120_000,
          ),
      });

      expect(media.deleteStoredUploadsWithReport).toHaveBeenCalledWith(manifest);
      const done = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(done.progressStage).toBe(PURGE_PROGRESS.DONE);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('falha parcial de upload impede DONE (mock R2)', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const store = new AccountPurgeStore(prisma as never);
      const users = buildUsers(prisma);
      const media = {
        deleteStoredUploadsWithReport: jest.fn().mockResolvedValue({
          attempted: 1,
          removed: 0,
          failedUrls: ['https://isolated.test/missing.png'],
        }),
      };
      const executor = new AccountPermanentPurgeExecutorImpl(
        prisma as never,
        users,
        media as never,
        store,
        new AccountPurgeAuditService(),
      );
      const past = new Date(Date.now() - 2 * 86400000);
      const now = new Date();
      const { id: userId } = await createActiveUser(prisma);
      await prisma.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          permanentDeletionAt: past,
          avatarUrl: 'https://isolated.test/missing.png',
        },
      });
      const job = await scheduleJobDirect(prisma, userId, past);
      const claimed = await store.tryClaimJob(job.id, 'up-worker', now, 120_000);
      await expect(
        executor.executePermanentPurge(userId, {
          jobId: job.id,
          workerId: 'up-worker',
          leaseEpoch: claimed!.leaseEpoch,
          renewLease: () =>
            store.renewLease(
              job.id,
              'up-worker',
              claimed!.leaseEpoch,
              now,
              120_000,
            ),
        }),
      ).rejects.toBeInstanceOf(UploadPurgeIncompleteError);

      const row = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(row.progressStage).toBe(PURGE_PROGRESS.DATA);
      expect(row.uploadManifest).toEqual(['https://isolated.test/missing.png']);
      expect(
        await store.markCompleted(
          job.id,
          'up-worker',
          claimed!.leaseEpoch,
          now,
        ),
      ).toBe(false);
    } finally {
      await prisma.$disconnect();
    }
  });
});
