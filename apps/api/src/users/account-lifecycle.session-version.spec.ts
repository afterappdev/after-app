import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
  Role,
} from '@prisma/client';
import { AccountLifecycleService } from './account-lifecycle.service';

function createPrisma() {
  const state = { sessionVersion: 0 };
  const prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    accountPurgeJob: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => {
        if (data.sessionVersion?.increment) {
          state.sessionVersion += data.sessionVersion.increment;
        }
        return Promise.resolve({});
      }),
    },
    accountPurgeJob: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
    fn(prisma),
  );
  return { prisma, state };
}

describe('AccountLifecycleService sessionVersion', () => {
  it('incrementa na primeira agenda e de novo ao cancelar', async () => {
    const { prisma, state } = createPrisma();
    const service = new AccountLifecycleService(prisma as never);

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.ACTIVE,
      deletionRequestedAt: null,
      permanentDeletionAt: null,
      deletionConfirmedAt: null,
    });
    prisma.accountPurgeJob.findUnique.mockResolvedValue(null);

    await service.scheduleAccountDeletion('u1');
    expect(state.sessionVersion).toBe(1);

    const permanent = new Date(Date.now() + 86400000);
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: permanent,
    });
    prisma.accountPurgeJob.findUnique.mockResolvedValue({
      status: AccountPurgeJobStatus.PENDING,
    });

    await service.cancelAccountDeletion('u1');
    expect(state.sessionVersion).toBe(2);
  });

  it('nova exclusão após recuperação incrementa novamente', async () => {
    const { prisma, state } = createPrisma();
    const service = new AccountLifecycleService(prisma as never);
    state.sessionVersion = 2;

    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.ACTIVE,
      deletionRequestedAt: null,
      permanentDeletionAt: null,
      deletionConfirmedAt: null,
    });
    prisma.accountPurgeJob.findUnique.mockResolvedValue(null);

    await service.scheduleAccountDeletion('u1');
    expect(state.sessionVersion).toBe(3);
  });
});
