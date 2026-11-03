import {
  accountPurgeAllowProduction,
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

  it('ALLOW_PRODUCTION padrão false', () => {
    expect(accountPurgeAllowProduction({})).toBe(false);
    expect(
      accountPurgeAllowProduction({ ACCOUNT_PURGE_ALLOW_PRODUCTION: '' }),
    ).toBe(false);
    expect(
      accountPurgeAllowProduction({ ACCOUNT_PURGE_ALLOW_PRODUCTION: 'false' }),
    ).toBe(false);
    expect(
      accountPurgeAllowProduction({ ACCOUNT_PURGE_ALLOW_PRODUCTION: 'maybe' }),
    ).toBe(false);
  });

  it('staging e desenvolvimento não exigem ALLOW_PRODUCTION', () => {
    const armed = {
      ACCOUNT_PURGE_ENABLED: 'true',
      ACCOUNT_PURGE_DRY_RUN: 'false',
      ACCOUNT_PURGE_ARM_DESTRUCTIVE: 'true',
      ACCOUNT_PURGE_EXECUTE: 'true',
    };
    expect(
      accountPurgeDestructiveAllowed({ ...armed, NODE_ENV: 'development' }),
    ).toBe(true);
    expect(
      accountPurgeDestructiveAllowed({ ...armed, NODE_ENV: 'staging' }),
    ).toBe(true);
    expect(
      accountPurgeDestructiveAllowed({ ...armed, NODE_ENV: 'test' }),
    ).toBe(true);
  });

  it('purge destrutivo exige arming duplo fora de produção', () => {
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

  const productionArmed = {
    NODE_ENV: 'production',
    ACCOUNT_PURGE_ENABLED: 'true',
    ACCOUNT_PURGE_DRY_RUN: 'false',
    ACCOUNT_PURGE_ARM_DESTRUCTIVE: 'true',
    ACCOUNT_PURGE_EXECUTE: 'true',
  };

  it('produção permanece bloqueada sem ALLOW_PRODUCTION', () => {
    expect(accountPurgeDestructiveAllowed(productionArmed)).toBe(false);
    expect(
      accountPurgeDestructiveAllowed({
        ...productionArmed,
        ACCOUNT_PURGE_ALLOW_PRODUCTION: 'false',
      }),
    ).toBe(false);
  });

  it('produção só libera o purge com todas as autorizações', () => {
    const authorized = {
      ...productionArmed,
      ACCOUNT_PURGE_ALLOW_PRODUCTION: 'true',
    };
    expect(accountPurgeDestructiveAllowed(authorized)).toBe(true);
    expect(
      accountPurgeDestructiveAllowed({
        ...authorized,
        ACCOUNT_PURGE_ENABLED: 'false',
      }),
    ).toBe(false);
    expect(
      accountPurgeDestructiveAllowed({
        ...authorized,
        ACCOUNT_PURGE_DRY_RUN: 'true',
      }),
    ).toBe(false);
    expect(
      accountPurgeDestructiveAllowed({
        ...authorized,
        ACCOUNT_PURGE_ARM_DESTRUCTIVE: 'false',
      }),
    ).toBe(false);
    expect(
      accountPurgeDestructiveAllowed({
        ...authorized,
        ACCOUNT_PURGE_EXECUTE: 'false',
      }),
    ).toBe(false);
  });
});
