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
  lastError?: string | null;
};

function createMemoryPrisma() {
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
      findMany: jest.fn(({ where, take }: { where: { OR: unknown[] }; take: number }) => {
        const now = new Date();
        const eligible = [...jobs.values()].filter((job) => {
          if (
            job.status === AccountPurgeJobStatus.CANCELLED ||
            job.status === AccountPurgeJobStatus.COMPLETED
          ) {
            return false;
          }
          const lockFree =
            job.lockedUntil == null || job.lockedUntil.getTime() < now.getTime();
          if (
            (job.status === AccountPurgeJobStatus.PENDING ||
              job.status === AccountPurgeJobStatus.FAILED) &&
            job.scheduledFor.getTime() <= now.getTime() &&
            lockFree
          ) {
            return true;
          }
          if (
            job.status === AccountPurgeJobStatus.PROCESSING &&
            job.lockedUntil != null &&
            job.lockedUntil.getTime() < now.getTime()
          ) {
            return true;
          }
          return false;
        });
        return Promise.resolve(
          eligible.slice(0, take).map((job) => ({ id: job.id })),
        );
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
          const now = new Date();
          if (!job) return Promise.resolve({ count: 0 });
          if (
            where.leaseEpoch != null &&
            job.leaseEpoch !== where.leaseEpoch
          ) {
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
          const lockFree =
            job.lockedUntil == null || job.lockedUntil.getTime() < now.getTime();
          const claimable =
            (job.status === AccountPurgeJobStatus.PENDING ||
              job.status === AccountPurgeJobStatus.FAILED) &&
            job.scheduledFor.getTime() <= now.getTime() &&
            lockFree;
          const abandoned =
            job.status === AccountPurgeJobStatus.PROCESSING &&
            job.lockedUntil != null &&
            job.lockedUntil.getTime() < now.getTime();
          const heldByOther =
            job.status === AccountPurgeJobStatus.PROCESSING &&
            job.lockedUntil != null &&
            job.lockedUntil.getTime() > now.getTime();
          if ((!claimable && !abandoned) || heldByOther) {
            return Promise.resolve({ count: 0 });
          }
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
      updateManyRelease: jest.fn(),
    },
    user: {
      findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(users.get(id) ?? null),
      ),
    },
    $transaction: jest.fn(async (fn: (tx: typeof client) => unknown) => fn(client)),
  };

  return { client, jobs, users };
}

describe('AccountPurgeStore', () => {
  it('não lista job cancelado ou concluído', async () => {
    const { client, jobs } = createMemoryPrisma();
    const past = new Date(Date.now() - 60_000);
    jobs.set('c', {
      id: 'c',
      userId: 'u1',
      scheduledFor: past,
      status: AccountPurgeJobStatus.CANCELLED,
      attempts: 0,
      lockedUntil: null,
      lockedBy: null,
      leaseEpoch: 0,
      cancelledAt: past,
    });
    jobs.set('d', {
      id: 'd',
      userId: 'u2',
      scheduledFor: past,
      status: AccountPurgeJobStatus.COMPLETED,
      attempts: 1,
      lockedUntil: null,
      lockedBy: null,
      leaseEpoch: 0,
      cancelledAt: null,
    });
    const store = new AccountPurgeStore(client as never);
    const ids = await store.listEligibleJobIds(new Date(), 10);
    expect(ids).toEqual([]);
  });

  it('job dentro dos 30 dias não é reivindicado', async () => {
    const { client, jobs, users } = createMemoryPrisma();
    const future = new Date(Date.now() + 86400000);
    jobs.set('j1', {
      id: 'j1',
      userId: 'u1',
      scheduledFor: future,
      status: AccountPurgeJobStatus.PENDING,
      attempts: 0,
      lockedUntil: null,
      lockedBy: null,
      leaseEpoch: 0,
      cancelledAt: null,
    });
    users.set('u1', {
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: future,
      role: 'USER',
    });
    const store = new AccountPurgeStore(client as never);
    expect(await store.listEligibleJobIds(new Date(), 5)).toEqual([]);
  });

  it('job vencido elegível é reivindicado e simulado', async () => {
    const { client, jobs, users } = createMemoryPrisma();
    const past = new Date(Date.now() - 1000);
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
    const store = new AccountPurgeStore(client as never);
    const now = new Date();
    const claimed = await store.tryClaimJob('j1', 'w1', now, 60_000);
    expect(claimed?.userId).toBe('u1');
    expect(jobs.get('j1')?.status).toBe(AccountPurgeJobStatus.PROCESSING);
    await store.releaseAfterSimulation(
      'j1',
      'w1',
      jobs.get('j1')!.leaseEpoch,
      new Date(now.getTime() + 30_000),
    );
    expect(jobs.get('j1')?.status).toBe(AccountPurgeJobStatus.PENDING);
    expect(jobs.get('j1')?.lockedBy).toBeNull();
  });

  it('conta recuperada cancela job ao revalidar', async () => {
    const { client, jobs, users } = createMemoryPrisma();
    const past = new Date(Date.now() - 1000);
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
      accountStatus: AccountLifecycleStatus.ACTIVE,
      permanentDeletionAt: null,
      role: 'USER',
    });
    const store = new AccountPurgeStore(client as never);
    const claimed = await store.tryClaimJob('j1', 'w1', new Date(), 60_000);
    expect(claimed).toBeNull();
    expect(jobs.get('j1')?.status).toBe(AccountPurgeJobStatus.CANCELLED);
  });

  it('lease expirado permite nova instância', async () => {
    const { client, jobs, users } = createMemoryPrisma();
    const past = new Date(Date.now() - 1000);
    jobs.set('j1', {
      id: 'j1',
      userId: 'u1',
      scheduledFor: past,
      status: AccountPurgeJobStatus.PROCESSING,
      attempts: 1,
      lockedUntil: new Date(Date.now() - 500),
      lockedBy: 'other',
      leaseEpoch: 3,
      cancelledAt: null,
    });
    users.set('u1', {
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: past,
      role: 'USER',
    });
    const store = new AccountPurgeStore(client as never);
    const claimed = await store.tryClaimJob('j1', 'w2', new Date(), 60_000);
    expect(claimed?.id).toBe('j1');
    expect(jobs.get('j1')?.lockedBy).toBe('w2');
  });

  it('duas instâncias: apenas uma reivindica', async () => {
    const { client, jobs, users } = createMemoryPrisma();
    const past = new Date(Date.now() - 1000);
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
    const store = new AccountPurgeStore(client as never);
    const now = new Date();
    const [a, b] = await Promise.all([
      store.tryClaimJob('j1', 'w1', now, 60_000),
      store.tryClaimJob('j1', 'w2', now, 60_000),
    ]);
    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);
  });

  it('marca FAILED após erro', async () => {
    const { client, jobs } = createMemoryPrisma();
    jobs.set('j1', {
      id: 'j1',
      userId: 'u1',
      scheduledFor: new Date(),
      status: AccountPurgeJobStatus.PROCESSING,
      attempts: 2,
      lockedUntil: new Date(Date.now() + 60_000),
      lockedBy: 'w1',
      leaseEpoch: 1,
      cancelledAt: null,
    });
    client.accountPurgeJob.updateManyRelease = client.accountPurgeJob.updateMany;
    client.accountPurgeJob.updateMany = jest.fn(
      ({ where, data }: { where: { id: string; lockedBy: string }; data: Record<string, unknown> }) => {
        const job = jobs.get(where.id);
        if (!job || job.lockedBy !== where.lockedBy) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(job, data);
        return Promise.resolve({ count: 1 });
      },
    );
    const store = new AccountPurgeStore(client as never);
    await store.markFailed('j1', 'w1', 1, 'provider down', new Date());
    expect(jobs.get('j1')?.status).toBe(AccountPurgeJobStatus.FAILED);
    expect(jobs.get('j1')?.lastError).toBe('provider down');
  });
});
