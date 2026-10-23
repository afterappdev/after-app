import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  mercadoPagoAccessTokenKind,
  mercadoPagoPublicKeyKind,
} from '../credits/providers/mercado-pago-credentials';

export type CardTestCredentialState = 'ausente' | 'test' | 'shared' | 'unknown';

export type CardTestSummary = {
  nodeEnv: string;
  sandbox: boolean;
  accessToken: CardTestCredentialState;
  publicKey: CardTestCredentialState;
  database: 'local' | 'ausente' | 'remoto' | 'invalido';
  databasePort: string;
  webhookSecret: 'presente' | 'ausente';
  webhookUrl: 'ausente' | 'https' | 'http' | 'outro';
};

/** Parses a dotenv file. Does not expand variables and does not log values. */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    let key = trimmed.slice(0, eq).trim();
    if (key.startsWith('export ')) key = key.slice('export '.length).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function databaseTarget(
  url: string | undefined,
): Pick<CardTestSummary, 'database' | 'databasePort'> {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return { database: 'ausente', databasePort: 'ausente' };
  try {
    const parsed = new URL(trimmed.replace(/^postgres(ql)?:/, 'http:'));
    const local =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    return {
      database: local ? 'local' : 'remoto',
      databasePort: parsed.port || '5432',
    };
  } catch {
    return { database: 'invalido', databasePort: 'ausente' };
  }
}

function webhookUrlClass(
  url: string | undefined,
): CardTestSummary['webhookUrl'] {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return 'ausente';
  if (trimmed.startsWith('https://')) return 'https';
  if (trimmed.startsWith('http://')) return 'http';
  return 'outro';
}

function credentialState(
  value: string | undefined,
  kind: (value: string | undefined) => 'test' | 'shared' | 'unknown',
): CardTestCredentialState {
  if (!value?.trim()) return 'ausente';
  return kind(value);
}

export type CardTestInspection = {
  summary: CardTestSummary;
  problems: string[];
};

/**
 * Loads `.env` and then `.env.card-test`. Keys present in the card-test file
 * win, including empty values, so the existing `.env` cannot put its Mercado
 * Pago credentials back. A blank DATABASE_URL in the card-test file does not
 * erase the URL already loaded from `.env`.
 */
export function inspectCardTestEnv(cwd = process.cwd()): CardTestInspection {
  if (process.env.AFTER_CARD_TEST !== '1') {
    throw new Error('O ambiente de teste do cartão não foi solicitado.');
  }
  const cardPath = resolve(cwd, '.env.card-test');
  if (!existsSync(cardPath)) {
    throw new Error('Arquivo .env.card-test ausente.');
  }
  const card = parseEnvFile(readFileSync(cardPath, 'utf8'));
  const envPath = resolve(cwd, '.env');
  const base = existsSync(envPath)
    ? parseEnvFile(readFileSync(envPath, 'utf8'))
    : {};
  const merged: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(card)) {
    if (key === 'DATABASE_URL' && !value.trim()) continue;
    merged[key] = value;
  }
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value;
  }
  process.env.AFTER_CARD_TEST = '1';

  const nodeEnv = process.env.NODE_ENV?.trim() || 'ausente';
  const sandbox =
    process.env.MERCADO_PAGO_SANDBOX?.trim().toLowerCase() === 'true';
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY;
  const database = databaseTarget(process.env.DATABASE_URL);
  const problems: string[] = [];

  if (nodeEnv !== 'development') {
    problems.push('NODE_ENV deve ser development.');
  }
  if (!sandbox) {
    problems.push('MERCADO_PAGO_SANDBOX deve ser true.');
  }
  if (!accessToken?.trim()) {
    problems.push('MERCADO_PAGO_ACCESS_TOKEN ausente em .env.card-test.');
  }
  if (!publicKey?.trim()) {
    problems.push('MERCADO_PAGO_PUBLIC_KEY ausente em .env.card-test.');
  }
  if (
    accessToken?.trim() &&
    publicKey?.trim() &&
    accessToken.trim() === publicKey.trim()
  ) {
    problems.push('MERCADO_PAGO_PUBLIC_KEY não pode ser igual ao Access Token.');
  }
  if (database.database !== 'local') {
    problems.push(
      'DATABASE_URL do teste não é local. Use somente localhost ou 127.0.0.1.',
    );
  }

  return {
    problems,
    summary: {
      nodeEnv,
      sandbox,
      accessToken: credentialState(accessToken, mercadoPagoAccessTokenKind),
      publicKey: credentialState(publicKey, mercadoPagoPublicKeyKind),
      database: database.database,
      databasePort: database.databasePort,
      webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()
        ? 'presente'
        : 'ausente',
      webhookUrl: webhookUrlClass(process.env.MERCADO_PAGO_WEBHOOK_URL),
    },
  };
}

/** Loads the card-test environment and refuses to continue when it is unsafe. */
export function loadCardTestEnv(cwd = process.cwd()): CardTestSummary {
  const inspection = inspectCardTestEnv(cwd);
  if (inspection.problems.length > 0) {
    throw new Error(inspection.problems.join(' '));
  }
  return inspection.summary;
}

/** Safe one-line status. Never includes credential or database values. */
export function formatCardTestSummary(summary: CardTestSummary): string {
  const database =
    summary.database === 'local'
      ? `local:${summary.databasePort}`
      : summary.database;
  return [
    `NODE_ENV=${summary.nodeEnv}`,
    `sandbox=${summary.sandbox ? 'true' : 'false'}`,
    `accessToken=${summary.accessToken}`,
    `publicKey=${summary.publicKey}`,
    `database=${database}`,
    `webhookSecret=${summary.webhookSecret}`,
    `webhookUrl=${summary.webhookUrl}`,
  ].join(' ');
}
