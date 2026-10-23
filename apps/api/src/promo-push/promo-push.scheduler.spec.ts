import { PromoPushScheduler } from './promo-push.scheduler';
import { PromoPushStore } from './promo-push.store';
import { PromoPushWorker } from './promo-push.worker';

describe('PromoPushScheduler', () => {
  function setup() {
    let lockedUntil = 0;
    let lockedBy = '';
    const store: PromoPushStore = {
      acquireLock: jest.fn(async (workerId: string, now: Date, leaseMs: number) => {
        if (lockedUntil > now.getTime()) return false;
        lockedUntil = now.getTime() + leaseMs;
        lockedBy = workerId;
        return true;
      }),
      releaseLock: jest.fn(async (workerId: string, now: Date) => {
        if (lockedBy === workerId) lockedUntil = now.getTime();
      }),
      expireOverdue: jest.fn(async () => 0),
      listReadyIds: jest.fn(async () => []),
      claim: jest.fn(async () => false),
      load: jest.fn(async () => null),
      loadAudience: jest.fn(async () => []),
      recentEventCounts: jest.fn(async () => new Map()),
      claimDeliveries: jest.fn(async () => []),
      markDeliveries: jest.fn(async () => undefined),
      disableToken: jest.fn(async () => undefined),
      finish: jest.fn(async () => undefined),
      release: jest.fn(async () => undefined),
    };
    const worker = {
      dispatchDue: jest.fn(async () => undefined),
    } as unknown as PromoPushWorker;
    const scheduler = new PromoPushScheduler(store, worker);
    return { store, worker, scheduler };
  }

  it('com a flag desligada expira atrasados e não dispara', async () => {
    const { store, worker, scheduler } = setup();
    scheduler.useEnv({ PROMO_PUSH_ENABLED: 'false', NODE_ENV: 'test' });
    await scheduler.tick(new Date('2026-10-20T15:00:00.000Z'));
    expect(store.expireOverdue).toHaveBeenCalled();
    expect(worker.dispatchDue).not.toHaveBeenCalled();
    expect(store.releaseLock).toHaveBeenCalled();
  });

  it('allowlist chama o worker sem abrir o público', async () => {
    const { worker, scheduler } = setup();
    scheduler.useEnv({
      PROMO_PUSH_ENABLED: 'false',
      PROMO_PUSH_ALLOWLIST_USER_IDS: 'user-a',
      NODE_ENV: 'test',
    });
    await scheduler.tick(new Date('2026-10-20T15:00:00.000Z'));
    expect(worker.dispatchDue).toHaveBeenCalledWith(
      expect.any(Date),
      { kind: 'allowlist', userIds: ['user-a'] },
    );
  });

  it('não processa enquanto outro worker segura o lock e volta quando o lock expira', async () => {
    const { store, scheduler } = setup();
    scheduler.useEnv({ PROMO_PUSH_ENABLED: 'false', NODE_ENV: 'test' });
    const now = new Date('2026-10-20T15:00:00.000Z');
    (store.acquireLock as jest.Mock).mockResolvedValueOnce(false);
    await scheduler.tick(now);
    expect(store.expireOverdue).not.toHaveBeenCalled();

    (store.acquireLock as jest.Mock).mockResolvedValueOnce(true);
    await scheduler.tick(new Date(now.getTime() + 130_000));
    expect(store.expireOverdue).toHaveBeenCalledTimes(1);
    expect(store.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('schema ausente não derruba a API e o próximo tick não insiste', async () => {
    const { store, scheduler } = setup();
    (store.acquireLock as jest.Mock).mockRejectedValueOnce({ code: 'P2021' });
    scheduler.useEnv({ PROMO_PUSH_ENABLED: 'true', NODE_ENV: 'production' });
    await expect(
      scheduler.tick(new Date('2026-10-20T15:00:00.000Z')),
    ).resolves.toBeUndefined();
    await scheduler.tick(new Date('2026-10-20T15:01:00.000Z'));
    expect(store.acquireLock).toHaveBeenCalledTimes(1);
  });

  it('desligada não dispara e ligar no mesmo dia chama o worker', async () => {
    const { worker, scheduler } = setup();
    const now = new Date('2026-10-20T15:00:00.000Z');
    scheduler.useEnv({ PROMO_PUSH_ENABLED: 'false', NODE_ENV: 'test' });
    await scheduler.tick(now);
    expect(worker.dispatchDue).not.toHaveBeenCalled();
    scheduler.useEnv({
      PROMO_PUSH_ENABLED: 'true',
      PROMO_PUSH_ALLOWLIST_USER_IDS: '',
      NODE_ENV: 'test',
    });
    const later = new Date(Date.now() + 5000);
    await scheduler.tick(later);
    expect(worker.dispatchDue).toHaveBeenCalledWith(later, { kind: 'public' });
  });

  it('não arma timer em teste e libera o timer fora dele', () => {
    const { scheduler } = setup();
    scheduler.useEnv({ NODE_ENV: 'test', PROMO_PUSH_ENABLED: 'false' });
    scheduler.onModuleInit();
    scheduler.onModuleDestroy();
    scheduler.useEnv({ NODE_ENV: 'production', PROMO_PUSH_ENABLED: 'false' });
    scheduler.onModuleInit();
    scheduler.onModuleDestroy();
  });
});
