import { PrismaClient } from '@prisma/client';
import {
  ISOLATED_PG_DATABASE,
  ISOLATED_PG_HOST,
  ISOLATED_PG_PASSWORD,
  ISOLATED_PG_PORT,
  ISOLATED_PG_USER,
  isolatedSuiteRunAuthorized,
} from '../../src/credits/isolated-pg-guard';
import { openIsolatedSession } from './session';

function disposableUrl(): string {
  const url = `postgresql://${ISOLATED_PG_USER}:${ISOLATED_PG_PASSWORD}@${ISOLATED_PG_HOST}:${ISOLATED_PG_PORT}/${ISOLATED_PG_DATABASE}?schema=public`;
  if (
    url !==
    'postgresql://after_credit_ledger_test:disposable-local-only@127.0.0.1:55432/after_credit_ledger_test?schema=public'
  ) {
    throw new Error('destino PostgreSQL recusado');
  }
  return url;
}

const suite = isolatedSuiteRunAuthorized(process.env) ? describe : describe.skip;

suite('homologação PostgreSQL — publicação VIP push', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const session = await openIsolatedSession();
    try {
      const rows = await session.query<{ current_database: string }>(
        'SELECT current_database() AS current_database',
      );
      if (rows[0]?.current_database !== ISOLATED_PG_DATABASE) {
        throw new Error('banco PostgreSQL recusado');
      }
    } finally {
      await session.close();
    }
    prisma = new PrismaClient({ datasources: { db: { url: disposableUrl() } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$disconnect();
  });

  it('schema contém tabelas VIP push', async () => {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN (
          'BannerSchedule',
          'VipCreditEntry',
          'BannerPublicationIdempotency',
          'PromoPushEvent'
        )
    `;
    expect(tables.map((row) => row.tablename).sort()).toEqual([
      'BannerPublicationIdempotency',
      'BannerSchedule',
      'PromoPushEvent',
      'VipCreditEntry',
    ]);
  });
});
