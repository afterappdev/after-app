import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
  Role,
} from '@prisma/client';
import { AccountLifecycleService } from '../../src/users/account-lifecycle.service';
import { ACCOUNT_DELETION_GRACE_MS } from '../../src/users/account-recovery';
import {
  cleanupSoftDeleteFixtures,
  createActiveUser,
  createVenueOwner,
  openIsolatedPrisma,
  softDeleteSuiteEnabled,
} from './soft-delete.harness';

const suite = softDeleteSuiteEnabled() ? describe : describe.skip;

suite('soft delete lifecycle (isolated postgres)', () => {
  const lifecycle = (prisma: Awaited<ReturnType<typeof openIsolatedPrisma>>) =>
    new AccountLifecycleService(prisma as never);

  afterEach(async () => {
    const prisma = await openIsolatedPrisma();
    try {
      await cleanupSoftDeleteFixtures(prisma);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('fluxo USER: schedule, idempotência, cancel, re-schedule, job único', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const { id: userId } = await createActiveUser(prisma);
      const svc = lifecycle(prisma);
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { sessionVersion: true },
      });

      const first = await svc.scheduleAccountDeletion(userId);
      expect(first.permanentDeletionAt.getTime()).toBeGreaterThan(Date.now());
      const expectedEnd = first.deletionRequestedAt.getTime() + ACCOUNT_DELETION_GRACE_MS;
      expect(Math.abs(first.permanentDeletionAt.getTime() - expectedEnd)).toBeLessThan(
        2000,
      );

      const userPending = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userPending.accountStatus).toBe(
        AccountLifecycleStatus.PENDING_DELETION,
      );
      expect(userPending.sessionVersion).toBe(before.sessionVersion + 1);

      const job1 = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { userId },
      });
      expect(job1.status).toBe(AccountPurgeJobStatus.PENDING);

      const second = await svc.scheduleAccountDeletion(userId);
      expect(second.permanentDeletionAt.getTime()).toBe(
        first.permanentDeletionAt.getTime(),
      );
      const userAfterRepeat = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { sessionVersion: true },
      });
      expect(userAfterRepeat.sessionVersion).toBe(userPending.sessionVersion);

      await svc.cancelAccountDeletion(userId);
      const active = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(active.accountStatus).toBe(AccountLifecycleStatus.ACTIVE);
      expect(active.sessionVersion).toBe(userPending.sessionVersion + 1);
      const cancelledJob = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { userId },
      });
      expect(cancelledJob.status).toBe(AccountPurgeJobStatus.CANCELLED);

      await svc.scheduleAccountDeletion(userId);
      const reopened = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { userId },
      });
      expect(reopened.status).toBe(AccountPurgeJobStatus.PENDING);
      const jobCount = await prisma.accountPurgeJob.count({ where: { userId } });
      expect(jobCount).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('fluxo VENUE com estabelecimento associado', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const { userId, venueId } = await createVenueOwner(prisma);
      const svc = lifecycle(prisma);
      await svc.scheduleAccountDeletion(userId);
      const venue = await prisma.venue.findUniqueOrThrow({
        where: { id: venueId },
      });
      expect(venue.ownerUserId).toBe(userId);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.role).toBe(Role.VENUE);
      expect(user.accountStatus).toBe(AccountLifecycleStatus.PENDING_DELETION);
    } finally {
      await prisma.$disconnect();
    }
  });
});
