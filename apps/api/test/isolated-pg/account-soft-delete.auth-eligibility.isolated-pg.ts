import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
} from '@prisma/client';
import jwt from 'jsonwebtoken';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import {
  assertNormalSessionJwt,
  buildSessionJwtPayload,
} from '../../src/auth/session-jwt';
import { ACCOUNT_RECOVERY_TYP } from '../../src/users/account-recovery';
import { AccountPurgeStore } from '../../src/users/account-purge.store';
import {
  cleanupSoftDeleteFixtures,
  createActiveUser,
  openIsolatedPrisma,
  scheduleJobDirect,
  softDeleteSuiteEnabled,
} from './soft-delete.harness';

const suite = softDeleteSuiteEnabled() ? describe : describe.skip;
const JWT_SECRET = 'isolated-soft-delete-jwt-secret';

function jwtStrategy(prisma: Awaited<ReturnType<typeof openIsolatedPrisma>>) {
  return new JwtStrategy(
    { getOrThrow: () => JWT_SECRET } as never,
    prisma as never,
  );
}

suite('soft delete JWT + eligibility (isolated postgres)', () => {
  afterEach(async () => {
    const prisma = await openIsolatedPrisma();
    try {
      await cleanupSoftDeleteFixtures(prisma);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('sessão válida, sv antigo, legacy sem sv após bump, recovery e PURGED', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const { id, email } = await createActiveUser(prisma);
      const strategy = jwtStrategy(prisma);
      await prisma.user.update({
        where: { id },
        data: { sessionVersion: 2, sessionInvalidatedAt: new Date(0) },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { id } });

      const good = jwt.sign(
        buildSessionJwtPayload({
          id,
          email,
          role: 'USER',
          sessionVersion: 2,
        }),
        JWT_SECRET,
      );
      const authUser = await strategy.validate(
        jwt.verify(good, JWT_SECRET) as never,
      );
      expect(authUser.tokenScope).toBe('session');

      const staleSv = jwt.sign(
        { sub: id, email, role: 'USER', sv: 1 },
        JWT_SECRET,
      );
      await expect(
        strategy.validate(jwt.verify(staleSv, JWT_SECRET) as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(() =>
        assertNormalSessionJwt(
          { sub: id, email, role: 'USER', iat: Math.floor(Date.now() / 1000) },
          user,
        ),
      ).toThrow(UnauthorizedException);

      await prisma.user.update({
        where: { id },
        data: {
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          permanentDeletionAt: new Date(Date.now() + 86400000),
        },
      });
      const pendingToken = jwt.sign(
        buildSessionJwtPayload({
          id,
          email,
          role: 'USER',
          sessionVersion: 2,
        }),
        JWT_SECRET,
      );
      await expect(
        strategy.validate(jwt.verify(pendingToken, JWT_SECRET) as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const recovery = jwt.sign(
        {
          sub: id,
          email,
          role: 'USER',
          typ: ACCOUNT_RECOVERY_TYP,
          iat: Math.floor(Date.now() / 1000),
        },
        JWT_SECRET,
        { expiresIn: '15m' },
      );
      const recoveryUser = await strategy.validate(
        jwt.verify(recovery, JWT_SECRET) as never,
      );
      expect(recoveryUser.tokenScope).toBe('recovery');

      const expiredRecovery = jwt.sign(
        {
          sub: id,
          email,
          role: 'USER',
          typ: ACCOUNT_RECOVERY_TYP,
        },
        JWT_SECRET,
        { expiresIn: -10 },
      );
      expect(() => jwt.verify(expiredRecovery, JWT_SECRET)).toThrow();

      await prisma.user.update({
        where: { id },
        data: { accountStatus: AccountLifecycleStatus.PURGED },
      });
      await expect(
        strategy.validate(jwt.verify(good, JWT_SECRET) as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('elegibilidade de claim por prazo e status do job', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const store = new AccountPurgeStore(prisma as never);
      const now = new Date('2030-06-01T12:00:00.000Z');
      const { id: userId } = await createActiveUser(prisma);

      await prisma.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          permanentDeletionAt: new Date('2030-07-01T12:00:00.000Z'),
        },
      });
      await scheduleJobDirect(
        prisma,
        userId,
        new Date('2030-07-01T12:00:00.000Z'),
      );
      const job = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { userId },
      });
      expect(await store.tryClaimJob(job.id, 'w1', now, 60_000)).toBeNull();

      await prisma.user.update({
        where: { id: userId },
        data: {
          permanentDeletionAt: new Date('2030-05-01T12:00:00.000Z'),
        },
      });
      await prisma.accountPurgeJob.update({
        where: { userId },
        data: { scheduledFor: new Date('2030-05-01T12:00:00.000Z') },
      });
      const claimed = await store.tryClaimJob(job.id, 'w1', now, 60_000);
      expect(claimed?.userId).toBe(userId);
      expect(claimed?.leaseEpoch).toBe(1);

      await prisma.user.update({
        where: { id: userId },
        data: { accountStatus: AccountLifecycleStatus.ACTIVE },
      });
      await prisma.accountPurgeJob.update({
        where: { userId },
        data: {
          status: AccountPurgeJobStatus.PENDING,
          lockedBy: null,
          lockedUntil: null,
        },
      });
      expect(await store.tryClaimJob(job.id, 'w2', now, 60_000)).toBeNull();

      await prisma.accountPurgeJob.update({
        where: { userId },
        data: { status: AccountPurgeJobStatus.CANCELLED },
      });
      expect(await store.tryClaimJob(job.id, 'w3', now, 60_000)).toBeNull();

      await prisma.accountPurgeJob.update({
        where: { userId },
        data: {
          status: AccountPurgeJobStatus.COMPLETED,
          completedAt: now,
        },
      });
      expect(await store.tryClaimJob(job.id, 'w4', now, 60_000)).toBeNull();

      await prisma.accountPurgeJob.update({
        where: { userId },
        data: {
          status: AccountPurgeJobStatus.PROCESSING,
          lockedBy: 'worker-live',
          lockedUntil: new Date('2030-06-01T12:05:00.000Z'),
          leaseEpoch: 5,
        },
      });
      expect(await store.tryClaimJob(job.id, 'w5', now, 60_000)).toBeNull();

      await prisma.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          permanentDeletionAt: new Date('2030-05-01T12:00:00.000Z'),
        },
      });
      await prisma.accountPurgeJob.update({
        where: { userId },
        data: {
          status: AccountPurgeJobStatus.PROCESSING,
          lockedBy: 'worker-live',
          lockedUntil: new Date('2030-06-01T11:00:00.000Z'),
          leaseEpoch: 5,
          scheduledFor: new Date('2030-05-01T12:00:00.000Z'),
        },
      });
      const afterLease = await store.tryClaimJob(job.id, 'w6', now, 60_000);
      expect(afterLease).not.toBeNull();
      expect(afterLease!.leaseEpoch).toBeGreaterThan(5);
      const processing = await prisma.accountPurgeJob.findUniqueOrThrow({
        where: { userId },
      });
      expect(processing.lockedBy).toBe('w6');
    } finally {
      await prisma.$disconnect();
    }
  });
});
