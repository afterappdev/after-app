import {
  accountPurgeDryRun,
  accountPurgeEnabled,
  accountPurgeDestructiveAllowed,
} from './account-purge.config';

describe('account-purge.config', () => {
  it('ACCOUNT_PURGE_ENABLED padrão false', () => {
    expect(accountPurgeEnabled({})).toBe(false);
    expect(accountPurgeEnabled({ ACCOUNT_PURGE_ENABLED: '' })).toBe(false);
  });

  it('permite ligar explicitamente', () => {
    expect(
      accountPurgeEnabled({ ACCOUNT_PURGE_ENABLED: 'true' }),
    ).toBe(true);
  });

  it('dry-run padrão true', () => {
    expect(accountPurgeDryRun({})).toBe(true);
  });

  it('purge destrutivo exige arming duplo e não roda em produção', () => {
    expect(accountPurgeDestructiveAllowed({ NODE_ENV: 'production' })).toBe(
      false,
    );
    expect(
      accountPurgeDestructiveAllowed({
        NODE_ENV: 'development',
        ACCOUNT_PURGE_ENABLED: 'true',
        ACCOUNT_PURGE_DRY_RUN: 'false',
      }),
    ).toBe(false);
    expect(
      accountPurgeDestructiveAllowed({
        NODE_ENV: 'development',
        ACCOUNT_PURGE_ENABLED: 'true',
        ACCOUNT_PURGE_DRY_RUN: 'false',
        ACCOUNT_PURGE_ARM_DESTRUCTIVE: 'true',
        ACCOUNT_PURGE_EXECUTE: 'true',
      }),
    ).toBe(true);
  });
});
