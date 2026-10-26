import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
  Role,
} from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AccountLifecycleService } from './account-lifecycle.service';
import { ACCOUNT_DELETION_GRACE_MS } from './account-recovery';

function createPrisma() {
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
    user: { findUnique: jest.fn(), update: jest.fn() },
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
  return prisma;
}

describe('AccountLifecycleService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: AccountLifecycleService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new AccountLifecycleService(prisma as never);
  });

  it('agenda exclusão com job e invalidação de sessão', async () => {
    const now = Date.now();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.ACTIVE,
      deletionRequestedAt: null,
      permanentDeletionAt: null,
    });
    prisma.accountPurgeJob.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({});
    prisma.accountPurgeJob.create.mockResolvedValue({});

    const result = await service.scheduleAccountDeletion('u1');

    expect(result.deletionRequestedAt).toBeInstanceOf(Date);
    expect(result.permanentDeletionAt!.getTime()).toBeGreaterThanOrEqual(
      now + ACCOUNT_DELETION_GRACE_MS - 1000,
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          sessionInvalidatedAt: expect.any(Date),
          sessionVersion: { increment: 1 },
        }),
      }),
    );
    expect(prisma.accountPurgeJob.create).toHaveBeenCalled();
  });

  it('solicitação repetida não prolonga o prazo', async () => {
    const requested = new Date('2026-01-01T12:00:00.000Z');
    const permanent = new Date('2026-01-31T12:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      deletionRequestedAt: requested,
      permanentDeletionAt: permanent,
    });
    prisma.accountPurgeJob.findUnique.mockResolvedValue({
      status: AccountPurgeJobStatus.PENDING,
    });
    prisma.user.update.mockResolvedValue({});
    prisma.accountPurgeJob.update.mockResolvedValue({});

    const result = await service.scheduleAccountDeletion('u1');

    expect(result.deletionRequestedAt).toEqual(requested);
    expect(result.permanentDeletionAt).toEqual(permanent);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          sessionVersion: expect.anything(),
        }),
      }),
    );
  });

  it('cancelamento restaura ACTIVE e cancela job', async () => {
    const permanent = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: permanent,
    });
    prisma.accountPurgeJob.findUnique.mockResolvedValue({
      status: AccountPurgeJobStatus.PENDING,
    });
    prisma.user.update.mockResolvedValue({});
    prisma.accountPurgeJob.update.mockResolvedValue({});

    await expect(service.cancelAccountDeletion('u1')).resolves.toEqual({
      ok: true,
    });
    expect(prisma.accountPurgeJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AccountPurgeJobStatus.CANCELLED,
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionVersion: { increment: 1 },
        }),
      }),
    );
  });

  it('cancelamento após prazo é rejeitado', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: new Date(Date.now() - 1000),
    });

    await expect(service.cancelAccountDeletion('u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('bloqueia cancelamento com purge em PROCESSING', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: new Date(Date.now() + 86400000),
    });
    prisma.accountPurgeJob.findUnique.mockResolvedValue({
      status: AccountPurgeJobStatus.PROCESSING,
    });

    await expect(service.cancelAccountDeletion('u1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
