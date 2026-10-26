import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
} from '@prisma/client';
import { AccountPurgeStore } from './account-purge.store';

type JobRow = {
  id: string;
  userId: string;
  scheduledFor: Date;
  status: AccountPurgeJobStatus;
  attempts: number;
  lockedUntil: Date | null;
  lockedBy: string | null;
  leaseEpoch: number;
  cancelledAt: Date | null;
};

function memoryStore() {
  const jobs = new Map<string, JobRow>();
  const users = new Map<
    string,
    {
      accountStatus: AccountLifecycleStatus;
      permanentDeletionAt: Date | null;
      role: 'USER' | 'VENUE' | 'ADMIN';
    }
  >();

  const client = {
    accountPurgeJob: {
      findMany: jest.fn(({ take }: { take: number }) => {
        const now = new Date();
        const eligible = [...jobs.values()].filter((job) => {
          const lockFree =
            job.lockedUntil == null || job.lockedUntil.getTime() < now.getTime();
          return (
            (job.status === AccountPurgeJobStatus.PENDING ||
              job.status === AccountPurgeJobStatus.FAILED) &&
            job.scheduledFor.getTime() <= now.getTime() &&
            lockFree
          );
        });
        return Promise.resolve(eligible.slice(0, take).map((j) => ({ id: j.id })));
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: {
            id: string;
            OR?: unknown[];
            lockedBy?: string;
            status?: AccountPurgeJobStatus;
            leaseEpoch?: number;
          };
          data: Record<string, unknown>;
        }) => {
          const job = jobs.get(where.id);
          if (!job) return Promise.resolve({ count: 0 });
          if (where.leaseEpoch != null && job.leaseEpoch !== where.leaseEpoch) {
            return Promise.resolve({ count: 0 });
          }
          if (
            where.lockedBy != null &&
            where.status === AccountPurgeJobStatus.PROCESSING
          ) {
            if (job.lockedBy !== where.lockedBy) {
              return Promise.resolve({ count: 0 });
            }
            Object.assign(job, data);
            return Promise.resolve({ count: 1 });
          }
          const now = new Date();
          const lockFree =
            job.lockedUntil == null || job.lockedUntil.getTime() < now.getTime();
          const claimable =
            (job.status === AccountPurgeJobStatus.PENDING ||
              job.status === AccountPurgeJobStatus.FAILED) &&
            job.scheduledFor.getTime() <= now.getTime() &&
            lockFree;
          if (!claimable) return Promise.resolve({ count: 0 });
          job.status = data.status as AccountPurgeJobStatus;
          job.lockedUntil = data.lockedUntil as Date;
          job.lockedBy = data.lockedBy as string;
          job.attempts += 1;
          const epochInc = data.leaseEpoch as { increment: number } | undefined;
          if (epochInc?.increment) job.leaseEpoch += epochInc.increment;
          return Promise.resolve({ count: 1 });
        },
      ),
      findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(jobs.get(id) ?? null),
      ),
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: {
            id: string;
            lockedBy: string;
            status: AccountPurgeJobStatus;
            leaseEpoch: number;
          };
        }) => {
          const job = jobs.get(where.id);
          if (
            !job ||
            job.lockedBy !== where.lockedBy ||
            job.status !== where.status ||
            job.leaseEpoch !== where.leaseEpoch
          ) {
            return Promise.resolve(null);
          }
          return Promise.resolve(job);
        },
      ),
      update: jest.fn(
        ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: Partial<JobRow>;
        }) => {
          const job = jobs.get(id);
          if (!job) throw new Error('missing');
          Object.assign(job, data);
          return Promise.resolve(job);
        },
      ),
    },
    user: {
      findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(users.get(id) ?? null),
      ),
    },
    $transaction: jest.fn(async (fn: (tx: typeof client) => unknown) => fn(client)),
  };

  return { client, jobs, users, store: new AccountPurgeStore(client as never) };
}

describe('account-purge concurrency (leaseEpoch fencing)', () => {
  it('dois workers: apenas um reivindica', async () => {
    const { jobs, users, store } = memoryStore();
    const past = new Date(Date.now() - 60_000);
    jobs.set('j1', {
      id: 'j1',
      userId: 'u1',
      scheduledFor: past,
      status: AccountPurgeJobStatus.PENDING,
      attempts: 0,
      lockedUntil: null,
      lockedBy: null,
      leaseEpoch: 0,
      cancelledAt: null,
    });
    users.set('u1', {
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: past,
      role: 'USER',
    });
    const [a, b] = await Promise.all([
      store.tryClaimJob('j1', 'worker-a', new Date(), 60_000),
      store.tryClaimJob('j1', 'worker-b', new Date(), 60_000),
    ]);
    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(jobs.get('j1')?.leaseEpoch).toBe(1);
  });

  it('worker antigo não salva progresso após nova reivindicação', async () => {
    const { jobs, users, store } = memoryStore();
    const past = new Date(Date.now() - 60_000);
    jobs.set('j1', {
      id: 'j1',
      userId: 'u1',
      scheduledFor: past,
      status: AccountPurgeJobStatus.PENDING,
      attempts: 0,
      lockedUntil: null,
      lockedBy: null,
      leaseEpoch: 0,
      cancelledAt: null,
    });
    users.set('u1', {
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: past,
      role: 'USER',
    });
    const first = await store.tryClaimJob('j1', 'worker-old', past, 1);
    expect(first?.leaseEpoch).toBe(1);
    jobs.set('j1', {
      ...jobs.get('j1')!,
      lockedUntil: new Date(Date.now() - 1),
      status: AccountPurgeJobStatus.PENDING,
      lockedBy: null,
    });
    const second = await store.tryClaimJob('j1', 'worker-new', new Date(), 60_000);
    expect(second?.leaseEpoch).toBe(2);
    const saved = await store.saveProgress(
      'j1',
      'worker-old',
      1,
      'FINANCIAL' as never,
    );
    expect(saved).toBe(false);
    const savedNew = await store.saveProgress(
      'j1',
      'worker-new',
      2,
      'FINANCIAL' as never,
    );
    expect(savedNew).toBe(true);
  });

  it('worker antigo não marca COMPLETED após perder lease', async () => {
    const { jobs, users, store } = memoryStore();
    const past = new Date(Date.now() - 60_000);
    jobs.set('j1', {
      id: 'j1',
      userId: 'u1',
      scheduledFor: past,
      status: AccountPurgeJobStatus.PROCESSING,
      attempts: 1,
      lockedUntil: new Date(Date.now() + 60_000),
      lockedBy: 'worker-new',
      leaseEpoch: 2,
      cancelledAt: null,
      progressStage: 'DONE',
    } as JobRow & { progressStage: string });
    users.set('u1', {
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: past,
      role: 'USER',
    });
    const completed = await store.markCompleted(
      'j1',
      'worker-old',
      1,
      new Date(),
    );
    expect(completed).toBe(false);
  });
});
