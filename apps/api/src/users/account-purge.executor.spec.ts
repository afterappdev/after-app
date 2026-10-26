import { AccountLifecycleStatus, Role } from '@prisma/client';
import { FinancialPurgeBlockedError } from './account-purge.financial';
import {
  AccountPermanentPurgeExecutorImpl,
  PurgeLeaseLostError,
} from './account-purge.executor.impl';
import { PURGE_PROGRESS } from './account-purge.progress';

describe('AccountPermanentPurgeExecutorImpl', () => {
  const store = {
    loadProcessingJob: jest.fn(),
    saveProgress: jest.fn(),
    assertLeaseHeld: jest.fn(),
  };
  const users = {
    listFinancialPurgeBlockersForUser: jest.fn(),
    anonymizeFinancialRetention: jest.fn(),
    loadUserForPermanentPurge: jest.fn(),
    collectUploadUrlsFromUser: jest.fn(),
    finalizePermanentUserRemoval: jest.fn(),
    revokeOAuthBeforePermanentRemoval: jest.fn(),
  };
  const prisma = { user: { findUnique: jest.fn() } };
  const mediaCleanup = {
    deleteStoredUploadsWithReport: jest.fn().mockResolvedValue({
      attempted: 0,
      removed: 0,
      failedUrls: [],
    }),
  };
  const purgeAudit = { log: jest.fn() };

  const ctx = {
    jobId: 'job-1',
    workerId: 'w1',
    leaseEpoch: 1,
    renewLease: jest.fn().mockResolvedValue(true),
  };

  let executor: AccountPermanentPurgeExecutorImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    store.assertLeaseHeld.mockResolvedValue(true);
    store.saveProgress.mockResolvedValue(true);
    executor = new AccountPermanentPurgeExecutorImpl(
      prisma as never,
      users as never,
      mediaCleanup as never,
      store as never,
      purgeAudit as never,
    );
  });

  function jobAt(stage: string | null, manifest: string[] = []) {
    store.loadProcessingJob.mockResolvedValue({
      id: 'job-1',
      userId: 'u1',
      progressStage: stage,
      uploadManifest: manifest,
      attempts: 1,
    });
  }

  it('rejeita sem lease', async () => {
    store.loadProcessingJob.mockResolvedValue(null);
    await expect(
      executor.executePermanentPurge('u1', ctx),
    ).rejects.toBeInstanceOf(PurgeLeaseLostError);
  });

  it('bloqueia conta com obrigação financeira aberta', async () => {
    jobAt(null);
    prisma.user.findUnique.mockResolvedValue({
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: new Date(Date.now() - 1000),
    });
    users.listFinancialPurgeBlockersForUser.mockResolvedValue([
      'credit_obligation_open',
    ]);

    await expect(
      executor.executePermanentPurge('u1', ctx),
    ).rejects.toBeInstanceOf(FinancialPurgeBlockedError);
    expect(users.finalizePermanentUserRemoval).not.toHaveBeenCalled();
    expect(mediaCleanup.deleteStoredUploadsWithReport).not.toHaveBeenCalled();
  });

  it('executa fases até uploads e DONE', async () => {
    jobAt(null);
    prisma.user.findUnique.mockResolvedValue({
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: new Date(Date.now() - 1000),
    });
    users.listFinancialPurgeBlockersForUser.mockResolvedValue([]);
    users.loadUserForPermanentPurge.mockResolvedValue({
      avatarUrl: 'https://cdn/a.jpg',
      venue: null,
    });
    users.collectUploadUrlsFromUser.mockReturnValue(['https://cdn/a.jpg']);
    users.finalizePermanentUserRemoval.mockResolvedValue('hard_deleted');

    await executor.executePermanentPurge('u1', ctx);

    expect(store.saveProgress).toHaveBeenCalledWith(
      'job-1',
      'w1',
      1,
      PURGE_PROGRESS.DONE,
      ['https://cdn/a.jpg'],
    );
    expect(mediaCleanup.deleteStoredUploadsWithReport).toHaveBeenCalledWith([
      'https://cdn/a.jpg',
    ]);
  });

  it('retoma a partir do manifest persistido', async () => {
    jobAt(PURGE_PROGRESS.DATA, ['https://cdn/x.png']);
    prisma.user.findUnique.mockResolvedValue({
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.PURGED,
      permanentDeletionAt: null,
    });
    users.finalizePermanentUserRemoval.mockResolvedValue('tombstoned');

    await executor.executePermanentPurge('u1', ctx);

    expect(users.loadUserForPermanentPurge).not.toHaveBeenCalled();
    expect(mediaCleanup.deleteStoredUploadsWithReport).toHaveBeenCalledWith([
      'https://cdn/x.png',
    ]);
  });

  it('grace period ativo impede purge', async () => {
    jobAt(null);
    prisma.user.findUnique.mockResolvedValue({
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      permanentDeletionAt: new Date(Date.now() + 86400000),
    });

    await expect(
      executor.executePermanentPurge('u1', ctx),
    ).rejects.toThrow('grace_period_active');
  });
});
