import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ISOLATED_PG_CONNECT_ENABLED,
  ISOLATED_PG_DATABASE,
  assertIsolatedPgTarget,
  connectIsolatedPostgres,
  isolatedPgTargetFromDedicatedEnv,
  isolatedSuiteRunAuthorized,
  type IsolatedPgTarget,
} from './isolated-pg-guard';

const root = join(__dirname, '..', '..');

function disposable(overrides: Partial<IsolatedPgTarget> = {}): IsolatedPgTarget {
  return {
    enabled: 'true',
    confirm: 'disposable',
    host: '127.0.0.1',
    port: '55432',
    database: ISOLATED_PG_DATABASE,
    user: 'after_credit_ledger_test',
    password: 'disposable-local-only',
    ...overrides,
  };
}

describe('isolated postgres guard', () => {
  it('aceita só o banco descartável local', () => {
    expect(() => assertIsolatedPgTarget(disposable())).not.toThrow();
  });

  it.each([
    ['desligado', { enabled: undefined }],
    ['sem confirmação', { confirm: 'true' }],
    ['banco after', { database: 'after' }],
    ['banco after_refund_tx', { database: 'after_refund_tx' }],
    ['porta do postgres local comum', { port: '5432' }],
    ['host remoto', { host: 'postgres.railway.internal' }],
    ['usuário after', { user: 'after' }],
    ['senha que não é o placeholder', { password: 'real-secret' }],
  ])('recusa %s', (_label, overrides) => {
    expect(() => assertIsolatedPgTarget(disposable(overrides))).toThrow(/isolated pg/);
  });

  it('ignora DATABASE_URL e não abre conexão', () => {
    const target = isolatedPgTargetFromDedicatedEnv({
      DATABASE_URL: 'postgresql://after:after@localhost:5432/after',
      AFTER_ISOLATED_PG_TEST: 'true',
      AFTER_ISOLATED_PG_CONFIRM: 'disposable',
      AFTER_ISOLATED_PG_HOST: '127.0.0.1',
      AFTER_ISOLATED_PG_PORT: '55432',
      AFTER_ISOLATED_PG_DATABASE: ISOLATED_PG_DATABASE,
      AFTER_ISOLATED_PG_USER: 'after_credit_ledger_test',
      AFTER_ISOLATED_PG_PASSWORD: 'disposable-local-only',
    });
    expect(target.database).toBe(ISOLATED_PG_DATABASE);
    expect(ISOLATED_PG_CONNECT_ENABLED).toBe(false);
    expect(isolatedSuiteRunAuthorized({ DATABASE_URL: 'postgresql://after:after@localhost:5432/after' })).toBe(
      false,
    );
    expect(() => connectIsolatedPostgres()).toThrow('não autorizada');
  });

  it('autoriza a suíte só com o destino descartável completo', () => {
    const env = {
      AFTER_ISOLATED_PG_TEST: 'true',
      AFTER_ISOLATED_PG_CONFIRM: 'disposable',
      AFTER_ISOLATED_PG_START: 'authorized',
      AFTER_ISOLATED_PG_HOST: '127.0.0.1',
      AFTER_ISOLATED_PG_PORT: '55432',
      AFTER_ISOLATED_PG_DATABASE: ISOLATED_PG_DATABASE,
      AFTER_ISOLATED_PG_USER: 'after_credit_ledger_test',
      AFTER_ISOLATED_PG_PASSWORD: 'disposable-local-only',
      DATABASE_URL: 'postgresql://after:after@127.0.0.1:5432/after',
    };
    expect(isolatedSuiteRunAuthorized(env)).toBe(true);
    expect(isolatedSuiteRunAuthorized({ ...env, AFTER_ISOLATED_PG_DATABASE: 'after' })).toBe(false);
    expect(isolatedSuiteRunAuthorized({ ...env, AFTER_ISOLATED_PG_PORT: '5432' })).toBe(false);
    expect(isolatedSuiteRunAuthorized({ ...env, AFTER_ISOLATED_PG_START: 'true' })).toBe(false);
  });

  it('a suíte fica fora do jest padrão e do e2e', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: { test: string; 'test:e2e': string };
    };
    const e2e = readFileSync(join(root, 'test', 'jest-e2e.json'), 'utf8');
    const isolated = JSON.parse(
      readFileSync(join(root, 'test', 'isolated-pg', 'jest-isolated-pg.json'), 'utf8'),
    ) as { testRegex: string };
    const suite = readFileSync(
      join(root, 'test', 'isolated-pg', 'credit-ledger.isolated-pg.ts'),
      'utf8',
    );
    const compose = readFileSync(
      join(root, 'test', 'isolated-pg', 'docker-compose.credit-ledger.yml'),
      'utf8',
    );
    const up = readFileSync(join(root, 'test', 'isolated-pg', 'up.ts'), 'utf8');
    const migration = readFileSync(
      join(
        root,
        'prisma',
        'migrations',
        '20261013125000_credit_obligation_and_ledger',
        'migration.sql',
      ),
      'utf8',
    );
    expect(pkg.scripts.test).toBe('jest');
    expect(pkg.scripts['test:e2e']).not.toContain('isolated-pg');
    expect(e2e).toContain('.e2e-spec.ts$');
    expect(isolated.testRegex).toBe('credit-ledger\\.isolated-pg\\.ts$');
    expect(suite).not.toContain('@prisma/client');
    expect(suite).not.toContain('DATABASE_URL');
    expect(suite).toContain('withIsolatedTransaction');
    expect(suite).toContain('INSERT INTO "CreditObligation"');
    expect(suite).not.toContain('after_refund_tx');
    expect(suite).not.toContain('5432');
    expect(compose).toContain('127.0.0.1:55432:5432');
    expect(compose).toContain('after_credit_ledger_test');
    expect(compose).not.toContain('railway');
    expect(up).toContain("AFTER_ISOLATED_PG_START !== 'authorized'");
    expect(migration).toContain(
      'FOREIGN KEY ("purchaseId", "venueId") REFERENCES "CreditPurchase"("id", "venueId")',
    );
    for (const relative of [
      'src/app.module.ts',
      'src/credits/credits.service.ts',
      'src/credits/providers/pix.provider.ts',
      'src/credits/providers/card.provider.ts',
    ]) {
      expect(readFileSync(join(root, relative), 'utf8')).not.toContain('credit-ledger.pg');
    }
  });
});
