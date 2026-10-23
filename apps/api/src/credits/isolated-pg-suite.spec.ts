import { readFileSync } from 'fs';
import { join } from 'path';
import { ISOLATED_PG_CONNECT_ENABLED } from './isolated-pg-guard';

const root = join(__dirname, '..', '..');

function read(relative: string): string {
  return readFileSync(join(root, relative), 'utf8');
}

describe('isolated postgres suite layout', () => {
  const suite = read('test/isolated-pg/credit-ledger.isolated-pg.ts');
  const session = read('test/isolated-pg/session.ts');
  const adapter = read('src/credits/credit-ledger.pg.ts');
  const pkg = JSON.parse(read('package.json')) as {
    scripts: { test: string; 'test:e2e': string };
  };

  it('prepara SQL real e permanece fora do jest comum', () => {
    expect(suite.match(/\bit\(/g)?.length).toBeGreaterThanOrEqual(10);
    expect(suite).toContain('INSERT INTO "CreditObligation"');
    expect(suite).toContain('INSERT INTO "CreditLedgerEntry"');
    expect(suite).toContain('SAVEPOINT before_failure');
    expect(suite).toContain('persistPlannedRefund');
    expect(suite).toContain('FOR UPDATE');
    expect(suite).toContain('failOnQuery');
    expect(suite).not.toContain('connectIsolatedPostgres');
    expect(suite).not.toContain('DATABASE_URL');
    expect(suite).not.toContain('after_refund_tx');
    expect(suite).not.toContain('5432');
    expect(suite).not.toContain('UPDATE "CreditWallet"');
    expect(pkg.scripts.test).toBe('jest');
    expect(pkg.scripts['test:e2e']).toBe('jest --config ./test/jest-e2e.json');
    expect(read('test/jest-e2e.json')).toContain('.e2e-spec.ts$');
    const isolated = JSON.parse(read('test/isolated-pg/jest-isolated-pg.json')) as {
      testRegex: string;
    };
    expect(isolated.testRegex).toBe('credit-ledger\\.isolated-pg\\.ts$');
  });

  it('bloqueia a conexão antes de carregar o driver', () => {
    expect(ISOLATED_PG_CONNECT_ENABLED).toBe(false);
    const flag = session.indexOf('isolatedSuiteRunAuthorized(process.env)');
    const driver = session.indexOf("createRequire(__filename)('pg')");
    expect(flag).toBeGreaterThan(-1);
    expect(driver).toBeGreaterThan(flag);
    expect(session).not.toContain('DATABASE_URL');
    expect(session).not.toContain('5432');
    expect(session).toContain('AFTER_ISOLATED_PG_START');
    expect(adapter).not.toContain('UPDATE "CreditWallet"');
    expect(adapter).not.toContain('DATABASE_URL');
    expect(adapter).not.toContain('BEGIN');
  });

  it('não entra nos serviços financeiros ativos', () => {
    for (const relative of [
      'src/app.module.ts',
      'src/credits/credits.service.ts',
      'src/credits/card-refund.ledger.ts',
      'src/credits/providers/pix.provider.ts',
      'src/credits/providers/card.provider.ts',
      'src/banners/banners.service.ts',
      'src/coupons/coupons.service.ts',
      'src/admin/finance.ts',
    ]) {
      const source = read(relative);
      expect(source).not.toContain('credit-ledger.pg');
      expect(source).not.toContain('isolated-pg/session');
      expect(source).not.toContain('persistPlannedRefund');
    }
  });
});
