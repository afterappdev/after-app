import { AccountPurgeJobStatus } from '@prisma/client';
import { AccountPurgeService } from './account-purge.service';
import type { AccountPurgeStore } from './account-purge.store';

describe('AccountPurgeService', () => {
  const store = {
    listEligibleJobIds: jest.fn(),
    tryClaimJob: jest.fn(),
    releaseAfterSimulation: jest.fn(),
    markFailed: jest.fn(),
    renewLease: jest.fn(),
    markCompleted: jest.fn(),
    assertLeaseHeld: jest.fn(),
  };
  const purgeAudit = { log: jest.fn() };
  const executor = {
    executePermanentPurge: jest.fn(),
  };
  let service: AccountPurgeService;

  beforeEach(() => {
    jest.clearAllMocks();
    store.assertLeaseHeld.mockResolvedValue(true);
    store.markCompleted.mockResolvedValue(true);
    service = new AccountPurgeService(
      store as unknown as AccountPurgeStore,
      executor,
      purgeAudit as never,
    );
    service.useEnv({
      ACCOUNT_PURGE_ENABLED: 'true',
      ACCOUNT_PURGE_DRY_RUN: 'true',
    });
  });

  it('desligado não lista jobs', async () => {
    service.useEnv({ ACCOUNT_PURGE_ENABLED: 'false' });
    const result = await service.runTick(new Date(), 'worker-1');
    expect(result.eligible).toBe(0);
    expect(store.listEligibleJobIds).not.toHaveBeenCalled();
  });

  it('simula job elegível sem chamar purge', async () => {
    const execute = jest.spyOn(executor, 'executePermanentPurge');
    store.listEligibleJobIds.mockResolvedValue(['job-1']);
    store.tryClaimJob.mockResolvedValue({
      id: 'job-1',
      userId: 'u1',
      status: AccountPurgeJobStatus.PENDING,
      attempts: 1,
      scheduledFor: new Date('2020-01-01'),
      leaseEpoch: 1,
    });

    const result = await service.runTick(new Date(), 'worker-1');
    expect(result.simulated).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(store.releaseAfterSimulation).toHaveBeenCalledWith(
      'job-1',
      'worker-1',
      1,
      expect.any(Date),
    );
  });

  it('não marca COMPLETED em simulação', async () => {
    store.listEligibleJobIds.mockResolvedValue(['job-1']);
    store.tryClaimJob.mockResolvedValue({
      id: 'job-1',
      userId: 'u1',
      status: AccountPurgeJobStatus.PENDING,
      attempts: 1,
      scheduledFor: new Date(),
      leaseEpoch: 1,
    });
    await service.runTick(new Date(), 'worker-1');
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it('mesmo com DRY_RUN=false a Fase G não chama purge sem arming duplo', async () => {
    store.listEligibleJobIds.mockResolvedValue(['job-1']);
    store.tryClaimJob.mockResolvedValue({
      id: 'job-1',
      userId: 'u1',
      status: AccountPurgeJobStatus.FAILED,
      attempts: 2,
      scheduledFor: new Date(),
      leaseEpoch: 1,
    });
    service.useEnv({
      ACCOUNT_PURGE_ENABLED: 'true',
      ACCOUNT_PURGE_DRY_RUN: 'false',
    });
    const execute = jest.spyOn(executor, 'executePermanentPurge');

    const result = await service.runTick(new Date(), 'worker-1');
    expect(result.simulated).toBe(1);
    expect(execute).not.toHaveBeenCalled();
  });

  function claimEligibleJob() {
    store.listEligibleJobIds.mockResolvedValue(['job-1']);
    store.tryClaimJob.mockResolvedValue({
      id: 'job-1',
      userId: 'u1',
      status: AccountPurgeJobStatus.PENDING,
      attempts: 1,
      scheduledFor: new Date('2020-01-01'),
      leaseEpoch: 1,
    });
  }

  it('produção com arming completo sem ALLOW_PRODUCTION não executa purge', async () => {
    claimEligibleJob();
    service.useEnv({
      NODE_ENV: 'production',
      ACCOUNT_PURGE_ENABLED: 'true',
      ACCOUNT_PURGE_DRY_RUN: 'false',
      ACCOUNT_PURGE_ARM_DESTRUCTIVE: 'true',
      ACCOUNT_PURGE_EXECUTE: 'true',
    });

    const result = await service.runTick(new Date(), 'worker-1');
    expect(result.simulated).toBe(1);
    expect(executor.executePermanentPurge).not.toHaveBeenCalled();
  });

  it('produção executa purge somente com todas as autorizações', async () => {
    claimEligibleJob();
    service.useEnv({
      NODE_ENV: 'production',
      ACCOUNT_PURGE_ENABLED: 'true',
      ACCOUNT_PURGE_DRY_RUN: 'false',
      ACCOUNT_PURGE_ARM_DESTRUCTIVE: 'true',
      ACCOUNT_PURGE_EXECUTE: 'true',
      ACCOUNT_PURGE_ALLOW_PRODUCTION: 'true',
    });

    const result = await service.runTick(new Date(), 'worker-1');
    expect(executor.executePermanentPurge).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        jobId: 'job-1',
        workerId: 'worker-1',
        leaseEpoch: 1,
      }),
    );
    expect(result.simulated).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('produção com arming completo e DRY_RUN=true permanece em simulação', async () => {
    claimEligibleJob();
    service.useEnv({
      NODE_ENV: 'production',
      ACCOUNT_PURGE_ENABLED: 'true',
      ACCOUNT_PURGE_DRY_RUN: 'true',
      ACCOUNT_PURGE_ARM_DESTRUCTIVE: 'true',
      ACCOUNT_PURGE_EXECUTE: 'true',
      ACCOUNT_PURGE_ALLOW_PRODUCTION: 'true',
    });

    const result = await service.runTick(new Date(), 'worker-1');
    expect(result.simulated).toBe(1);
    expect(executor.executePermanentPurge).not.toHaveBeenCalled();
  });

  it('staging com arming completo executa purge sem ALLOW_PRODUCTION', async () => {
    claimEligibleJob();
    service.useEnv({
      NODE_ENV: 'staging',
      ACCOUNT_PURGE_ENABLED: 'true',
      ACCOUNT_PURGE_DRY_RUN: 'false',
      ACCOUNT_PURGE_ARM_DESTRUCTIVE: 'true',
      ACCOUNT_PURGE_EXECUTE: 'true',
    });

    await service.runTick(new Date(), 'worker-1');
    expect(executor.executePermanentPurge).toHaveBeenCalled();
  });

  it('job já concluído não é reprocessado no mesmo tick', async () => {
    store.listEligibleJobIds.mockResolvedValue(['job-1', 'job-1']);
    store.tryClaimJob
      .mockResolvedValueOnce({
        id: 'job-1',
        userId: 'u1',
        status: AccountPurgeJobStatus.PENDING,
        attempts: 1,
        scheduledFor: new Date('2020-01-01'),
        leaseEpoch: 1,
      })
      .mockResolvedValueOnce(null);
    service.useEnv({
      NODE_ENV: 'development',
      ACCOUNT_PURGE_ENABLED: 'true',
      ACCOUNT_PURGE_DRY_RUN: 'false',
      ACCOUNT_PURGE_ARM_DESTRUCTIVE: 'true',
      ACCOUNT_PURGE_EXECUTE: 'true',
    });

    const result = await service.runTick(new Date(), 'worker-1');
    expect(executor.executePermanentPurge).toHaveBeenCalledTimes(1);
    expect(result.claimed).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
