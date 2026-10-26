import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
} from '@prisma/client';
import { AccountLifecycleService } from '../../src/users/account-lifecycle.service';
import { AccountPurgeStore } from '../../src/users/account-purge.store';
import { PURGE_PROGRESS } from '../../src/users/account-purge.progress';
import {
  cleanupSoftDeleteFixtures,
  createActiveUser,
  openIsolatedPrisma,
  scheduleJobDirect,
  softDeleteSuiteEnabled,
} from './soft-delete.harness';

const suite = softDeleteSuiteEnabled() ? describe : describe.skip;

suite('soft delete concurrency (isolated postgres)', () => {
  afterEach(async () => {
    const prisma = await openIsolatedPrisma();
    try {
      await cleanupSoftDeleteFixtures(prisma);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('dois workers: um claim, leaseEpoch, worker antigo bloqueado', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const store = new AccountPurgeStore(prisma as never);
      const now = new Date('2031-01-15T10:00:00.000Z');
      const { id: userId } = await createActiveUser(prisma);
      await prisma.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          permanentDeletionAt: new Date('2031-01-01T00:00:00.000Z'),
        },
      });
      const job = await scheduleJobDirect(
        prisma,
        userId,
        new Date('2031-01-01T00:00:00.000Z'),
      );

      const [a, b] = await Promise.all([
        store.tryClaimJob(job.id, 'worker-a', now, 120_000),
        store.tryClaimJob(job.id, 'worker-b', now, 120_000),
      ]);
      const winners = [a, b].filter(Boolean);
      expect(winners).toHaveLength(1);
      const winner = winners[0]!;
      expect(winner.leaseEpoch).toBe(1);
      const winnerWorker = a ? 'worker-a' : 'worker-b';
      const loserId = winnerWorker === 'worker-a' ? 'worker-b' : 'worker-a';
      const staleEpoch = 0;
      expect(
        await store.saveProgress(
          job.id,
          loserId,
          staleEpoch,
          PURGE_PROGRESS.FINANCIAL,
        ),
      ).toBe(false);
      expect(
        await store.markCompleted(job.id, loserId, staleEpoch, now),
      ).toBe(false);

      expect(
        await store.saveProgress(
          job.id,
          winnerWorker,
          winner.leaseEpoch,
          PURGE_PROGRESS.FINANCIAL,
        ),
      ).toBe(true);

      await prisma.accountPurgeJob.update({
        where: { id: job.id },
        data: {
          lockedUntil: new Date('2031-01-15T09:00:00.000Z'),
          status: AccountPurgeJobStatus.PROCESSING,
        },
      });
      const reclaimed = await store.tryClaimJob(job.id, 'worker-new', now, 60_000);
      expect(reclaimed?.leaseEpoch).toBe(2);
      expect(
        await store.saveProgress(
          job.id,
          winnerWorker,
          winner.leaseEpoch,
          PURGE_PROGRESS.DATA,
        ),
      ).toBe(false);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('uploads: lease expira, worker B retoma, worker A não progride nem conclui', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const store = new AccountPurgeStore(prisma as never);
      const now = new Date('2032-06-01T12:00:00.000Z');
      const { id: userId } = await createActiveUser(prisma);
      await prisma.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          permanentDeletionAt: new Date('2032-05-01T00:00:00.000Z'),
        },
      });
      const manifest = ['https://isolated.test/upload-fence.png'];
      const job = await scheduleJobDirect(
        prisma,
        userId,
        new Date('2032-05-01T00:00:00.000Z'),
      );
      const claimedA = await store.tryClaimJob(job.id, 'worker-a', now, 30_000);
      expect(claimedA?.leaseEpoch).toBe(1);
      expect(
        await store.saveProgress(
          job.id,
          'worker-a',
          claimedA!.leaseEpoch,
          PURGE_PROGRESS.DATA,
          manifest,
        ),
      ).toBe(true);

      await prisma.accountPurgeJob.update({
        where: { id: job.id },
        data: {
          lockedUntil: new Date('2032-06-01T11:00:00.000Z'),
        },
      });
      const claimedB = await store.tryClaimJob(job.id, 'worker-b', now, 60_000);
      expect(claimedB?.leaseEpoch).toBe(2);
      expect(
        await store.saveProgress(
          job.id,
          'worker-a',
          claimedA!.leaseEpoch,
          PURGE_PROGRESS.UPLOADS,
          manifest,
        ),
      ).toBe(false);
      expect(
        await store.markCompleted(
          job.id,
          'worker-a',
          claimedA!.leaseEpoch,
          now,
        ),
      ).toBe(false);
      expect(
        await store.saveProgress(
          job.id,
          'worker-b',
          claimedB!.leaseEpoch,
          PURGE_PROGRESS.UPLOADS,
          manifest,
        ),
      ).toBe(true);
      expect(
        await store.saveProgress(
          job.id,
          'worker-b',
          claimedB!.leaseEpoch,
          PURGE_PROGRESS.DONE,
          manifest,
        ),
      ).toBe(true);
      expect(
        await store.markCompleted(
          job.id,
          'worker-b',
          claimedB!.leaseEpoch,
          now,
        ),
      ).toBe(true);
      const row = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(row.status).toBe(AccountPurgeJobStatus.COMPLETED);
      expect(row.completedAt).not.toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('recuperação simultânea ao job PROCESSING falha', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const lifecycle = new AccountLifecycleService(prisma as never);
      const { id: userId } = await createActiveUser(prisma);
      await lifecycle.scheduleAccountDeletion(userId);
      await prisma.accountPurgeJob.update({
        where: { userId },
        data: {
          status: AccountPurgeJobStatus.PROCESSING,
          lockedBy: 'worker-x',
          lockedUntil: new Date(Date.now() + 60_000),
        },
      });
      await expect(lifecycle.cancelAccountDeletion(userId)).rejects.toThrow(
        /exclusão definitiva já está em andamento/,
      );
    } finally {
      await prisma.$disconnect();
    }
  });
});
