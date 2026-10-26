import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
  Role,
} from '@prisma/client';
import { AccountLifecycleService } from './account-lifecycle.service';
import { AccountPurgeStore } from './account-purge.store';

describe('Account purge + lifecycle', () => {
  it('nova solicitação após recuperação reabre job PENDING', async () => {
    const prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      accountPurgeJob: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
    };
    const lifecycle = new AccountLifecycleService(prisma as never);

    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.ACTIVE,
      deletionRequestedAt: null,
      permanentDeletionAt: null,
      deletionConfirmedAt: null,
    });
    prisma.accountPurgeJob.findUnique.mockResolvedValue({
      status: AccountPurgeJobStatus.CANCELLED,
    });
    prisma.user.update.mockResolvedValue({});
    prisma.accountPurgeJob.update.mockResolvedValue({});

    await lifecycle.scheduleAccountDeletion('u1');

    expect(prisma.accountPurgeJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AccountPurgeJobStatus.PENDING,
        }),
      }),
    );
  });

  it('store expõe listEligible após agenda (smoke)', async () => {
    const store = new AccountPurgeStore({
      accountPurgeJob: {
        findMany: jest.fn().mockResolvedValue([{ id: 'j1' }]),
      },
    } as never);
    const ids = await store.listEligibleJobIds(new Date(), 3);
    expect(ids).toEqual(['j1']);
  });
});
