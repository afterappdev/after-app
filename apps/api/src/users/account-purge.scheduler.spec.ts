import { AccountPurgeScheduler } from './account-purge.scheduler';
import { AccountPurgeService } from './account-purge.service';

describe('AccountPurgeScheduler', () => {
  it('não executa tick quando desabilitado', async () => {
    const purge = {
      useEnv: jest.fn().mockReturnThis(),
      runTick: jest.fn(),
      isEnabled: jest.fn(),
    };
    const scheduler = new AccountPurgeScheduler(purge as unknown as AccountPurgeService);
    scheduler.useEnv({ ACCOUNT_PURGE_ENABLED: 'false' });
    await scheduler.tick();
    expect(purge.runTick).not.toHaveBeenCalled();
  });

  it('evita overlap na mesma instância', async () => {
    let release!: () => void;
    const purge = {
      useEnv: jest.fn().mockReturnThis(),
      runTick: jest.fn(
        () =>
          new Promise((resolve) => {
            release = () =>
              resolve({
                eligible: 0,
                claimed: 0,
                simulated: 0,
                failed: 0,
                skipped: 0,
              });
          }),
      ),
    };
    const scheduler = new AccountPurgeScheduler(purge as unknown as AccountPurgeService);
    scheduler.useEnv({ ACCOUNT_PURGE_ENABLED: 'true' });
    const first = scheduler.tick();
    await scheduler.tick();
    expect(purge.runTick).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});
