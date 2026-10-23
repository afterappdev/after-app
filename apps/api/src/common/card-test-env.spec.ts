import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  formatCardTestSummary,
  loadCardTestEnv,
} from './card-test-env';

const SECRET = 'APP_USR-card-test-access-token';
const PUBLIC = 'APP_USR-card-test-public-key';
const LOCAL_DB = 'postgresql://after:after@127.0.0.1:5433/after?schema=public';
const REMOTE_DB = 'postgresql://after:secret@db.example.com:5432/after';

function writeEnv(dir: string, name: string, body: string) {
  writeFileSync(join(dir, name), body);
}

describe('card test env', () => {
  const snapshot = { ...process.env };
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'after-card-test-'));
    process.env.AFTER_CARD_TEST = '1';
    delete process.env.NODE_ENV;
    delete process.env.MERCADO_PAGO_SANDBOX;
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    delete process.env.MERCADO_PAGO_PUBLIC_KEY;
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    delete process.env.MERCADO_PAGO_WEBHOOK_URL;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('faz o par do card-test vencer o token que já estava no .env', () => {
    writeEnv(
      dir,
      '.env',
      [
        `DATABASE_URL=${LOCAL_DB}`,
        'MERCADO_PAGO_ACCESS_TOKEN=APP_USR-from-dotenv',
        'MERCADO_PAGO_PUBLIC_KEY=APP_USR-from-dotenv-public',
        'MERCADO_PAGO_SANDBOX=false',
        'NODE_ENV=production',
      ].join('\n'),
    );
    writeEnv(
      dir,
      '.env.card-test',
      [
        'NODE_ENV=development',
        'MERCADO_PAGO_SANDBOX=true',
        `MERCADO_PAGO_ACCESS_TOKEN=${SECRET}`,
        `MERCADO_PAGO_PUBLIC_KEY=${PUBLIC}`,
        'MERCADO_PAGO_WEBHOOK_SECRET=',
        'MERCADO_PAGO_WEBHOOK_URL=',
        'DATABASE_URL=',
      ].join('\n'),
    );

    const summary = loadCardTestEnv(dir);
    expect(process.env.MERCADO_PAGO_ACCESS_TOKEN).toBe(SECRET);
    expect(process.env.MERCADO_PAGO_PUBLIC_KEY).toBe(PUBLIC);
    expect(process.env.NODE_ENV).toBe('development');
    expect(process.env.MERCADO_PAGO_SANDBOX).toBe('true');
    expect(process.env.DATABASE_URL).toBe(LOCAL_DB);
    expect(formatCardTestSummary(summary)).toBe(
      'NODE_ENV=development sandbox=true accessToken=shared publicKey=shared database=local:5433 webhookSecret=ausente webhookUrl=ausente',
    );
    expect(formatCardTestSummary(summary)).not.toContain(SECRET);
    expect(formatCardTestSummary(summary)).not.toContain(PUBLIC);
  });

  it('recusa subir quando o par de teste ainda está vazio', () => {
    writeEnv(dir, '.env', `DATABASE_URL=${LOCAL_DB}\nMERCADO_PAGO_ACCESS_TOKEN=${SECRET}\n`);
    writeEnv(
      dir,
      '.env.card-test',
      [
        'NODE_ENV=development',
        'MERCADO_PAGO_SANDBOX=true',
        'MERCADO_PAGO_ACCESS_TOKEN=',
        'MERCADO_PAGO_PUBLIC_KEY=',
      ].join('\n'),
    );

    expect(() => loadCardTestEnv(dir)).toThrow(/ACCESS_TOKEN ausente/);
    expect(process.env.MERCADO_PAGO_ACCESS_TOKEN).toBe('');
    expect(process.env.MERCADO_PAGO_ACCESS_TOKEN).not.toBe(SECRET);
  });

  it('recusa banco remoto sem revelar o host', () => {
    writeEnv(dir, '.env', `DATABASE_URL=${REMOTE_DB}`);
    writeEnv(
      dir,
      '.env.card-test',
      [
        'NODE_ENV=development',
        'MERCADO_PAGO_SANDBOX=true',
        `MERCADO_PAGO_ACCESS_TOKEN=${SECRET}`,
        `MERCADO_PAGO_PUBLIC_KEY=${PUBLIC}`,
      ].join('\n'),
    );

    expect(() => loadCardTestEnv(dir)).toThrow(/não é local/);
    try {
      loadCardTestEnv(dir);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('example.com');
      expect((error as Error).message).not.toContain(SECRET);
    }
  });
});
