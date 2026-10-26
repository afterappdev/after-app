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

function buildExecutor(
  prisma: Awaited<ReturnType<typeof openIsolatedPrisma>>,
  media: { deleteStoredUploadsWithReport: jest.Mock },
) {
  const users = new UsersService(
    prisma as never,
    media as never,
    { revokeForAccount: jest.fn().mockResolvedValue(undefined) } as never,
    new AccountLifecycleService(prisma as never),
  );
  return new AccountPermanentPurgeExecutorImpl(
    prisma as never,
    users,
    media as never,
    new AccountPurgeStore(prisma as never),
    new AccountPurgeAuditService(),
  );
}

suite('soft delete hard delete + upload retry (isolated postgres)', () => {
  afterEach(async () => {
    const prisma = await openIsolatedPrisma();
    try {
      await cleanupSoftDeleteFixtures(prisma);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('manifesto antes do hard delete, falha R2, retry UPLOADS sem User, DONE idempotente', async () => {
    const prisma = await openIsolatedPrisma();
    const media = {
      deleteStoredUploadsWithReport: jest
        .fn()
        .mockResolvedValueOnce({
          attempted: 1,
          removed: 0,
          failedUrls: ['https://isolated.test/retry-a.png'],
        })
        .mockResolvedValueOnce({
          attempted: 1,
          removed: 1,
          failedUrls: [],
        }),
    };
    try {
      const store = new AccountPurgeStore(prisma as never);
      const executor = buildExecutor(prisma, media);
      const past = new Date(Date.now() - 2 * 86400000);
      const now = new Date();
      const manifest = ['https://isolated.test/retry-a.png'];
      const { id: userId } = await createActiveUser(prisma);
      await prisma.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          permanentDeletionAt: past,
          avatarUrl: manifest[0],
        },
      });
      const job = await scheduleJobDirect(prisma, userId, past);
      const claimed = await store.tryClaimJob(job.id, 'worker-1', now, 120_000);
      expect(claimed?.leaseEpoch).toBe(1);

      await expect(
        executor.executePermanentPurge(userId, {
          jobId: job.id,
          workerId: 'worker-1',
          leaseEpoch: claimed!.leaseEpoch,
          renewLease: () =>
            store.renewLease(
              job.id,
              'worker-1',
              claimed!.leaseEpoch,
              now,
              120_000,
            ),
        }),
      ).rejects.toBeInstanceOf(UploadPurgeIncompleteError);

      const mid = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(mid.progressStage).toBe(PURGE_PROGRESS.DATA);
      expect(mid.uploadManifest).toEqual(manifest);
      expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
      expect(
        await store.markCompleted(job.id, 'worker-1', claimed!.leaseEpoch, now),
      ).toBe(false);

      await store.markFailed(
        job.id,
        'worker-1',
        claimed!.leaseEpoch,
        'upload_purge_incomplete',
        now,
      );

      const reclaimed = await store.tryClaimJob(job.id, 'worker-2', now, 120_000);
      expect(reclaimed?.leaseEpoch).toBeGreaterThan(claimed!.leaseEpoch);

      await executor.executePermanentPurge(userId, {
        jobId: job.id,
        workerId: 'worker-2',
        leaseEpoch: reclaimed!.leaseEpoch,
        renewLease: () =>
          store.renewLease(
            job.id,
            'worker-2',
            reclaimed!.leaseEpoch,
            now,
            120_000,
          ),
      });

      expect(media.deleteStoredUploadsWithReport).toHaveBeenCalledTimes(2);
      expect(media.deleteStoredUploadsWithReport.mock.calls[1][0]).toEqual(
        manifest,
      );

      const done = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(done.progressStage).toBe(PURGE_PROGRESS.DONE);
      await executor.executePermanentPurge(userId, {
        jobId: job.id,
        workerId: 'worker-2',
        leaseEpoch: reclaimed!.leaseEpoch,
        renewLease: () =>
          store.renewLease(
            job.id,
            'worker-2',
            reclaimed!.leaseEpoch,
            now,
            120_000,
          ),
      });
      expect(media.deleteStoredUploadsWithReport).toHaveBeenCalledTimes(2);
      expect(
        await store.markCompleted(
          job.id,
          'worker-2',
          reclaimed!.leaseEpoch,
          now,
        ),
      ).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });
});
