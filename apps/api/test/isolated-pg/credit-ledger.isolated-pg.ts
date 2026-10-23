import { persistPlannedRefund, type StoredLedgerEntry } from '../../src/credits/credit-ledger.persist';
import {
  createPostgresCreditLedgerTx,
  interpretCompositeForeignKey,
  type IsolatedSql,
} from '../../src/credits/credit-ledger.pg';
import { isolatedSuiteRunAuthorized } from '../../src/credits/isolated-pg-guard';
import {
  countByVenue,
  createLedgerFixture,
  deleteLedgerFixture,
  seedLedgerFixture,
  type LedgerFixture,
} from './fixtures';
import {
  deferred,
  failAfterQuery,
  failOnQuery,
  isRestrictViolation,
  sqlState,
  withIsolatedTransaction,
  withRolledBackTransaction,
} from './session';

/**
 * PostgreSQL suite for the credit ledger. The source flag stays false.
 * The block runs only when this process passes every disposable-target check.
 * npm test and npm run test:e2e do not match this filename.
 */
const suite = isolatedSuiteRunAuthorized(process.env) ? describe : describe.skip;

suite('credit ledger isolated postgres', () => {
  it('cria CreditObligation e CreditLedgerEntry com as constraints da migration', async () => {
    await withRolledBackTransaction(async (db) => {
      const tables = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('CreditObligation', 'CreditLedgerEntry')`,
      );
      expect(tables.map((row) => row.table_name).sort()).toEqual([
        'CreditLedgerEntry',
        'CreditObligation',
      ]);
      const constraints = await db.query<{ conname: string; confdeltype: string }>(
        `SELECT con.conname, con.confdeltype
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         WHERE rel.relname IN ('CreditObligation', 'CreditLedgerEntry')`,
      );
      const indexes = await db.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE tablename IN ('CreditObligation', 'CreditLedgerEntry')`,
      );
      const names = constraints.map((row) => row.conname);
      const indexNames = indexes.map((row) => row.indexname);
      for (const name of [
        'CreditObligation_credits_nonnegative_check',
        'CreditObligation_credits_partition_check',
        'CreditObligation_credits_settled_check',
        'CreditObligation_status_check',
        'CreditObligation_source_check',
        'CreditObligation_purchaseId_venueId_fkey',
        'CreditLedgerEntry_purchaseId_venueId_fkey',
        'CreditLedgerEntry_obligationId_venueId_fkey',
        'CreditLedgerEntry_redemptionId_venueId_fkey',
        'CreditLedgerEntry_bannerId_venueId_fkey',
      ]) {
        expect(names).toContain(name);
      }
      expect(indexNames).toEqual(
        expect.arrayContaining([
          'CreditObligation_purchaseId_key',
          'CreditLedgerEntry_operationKey_key',
        ]),
      );
      const foreignKeys = constraints.filter((row) => row.conname.endsWith('_fkey'));
      expect(foreignKeys.length).toBeGreaterThan(0);
      expect(foreignKeys.every((row) => row.confdeltype === 'r')).toBe(true);
    });
  });

  it('rejeita créditos inválidos, purchaseId repetido e operationKey repetida', async () => {
    const fx = createLedgerFixture();
    await withRolledBackTransaction(async (db) => {
      await seedLedgerFixture(db, fx);
      await expectRejected(db, insertObligation(db, fx, { creditsOriginal: -1 }), '23514');
      await expectRejected(
        db,
        insertObligation(db, fx, { creditsRecovered: 4, creditsOpened: 2 }),
        '23514',
      );
      await expectRejected(db, insertObligation(db, fx, { source: 'coupon' }), '23514');
      await insertObligation(db, fx, {});
      await expectRejected(db, insertObligation(db, fx, { id: `${fx.prefix}-ob-2` }), '23505');
      await insertEntry(db, fx, { operationKey: `${fx.prefix}-op` });
      await expectRejected(
        db,
        insertEntry(db, fx, { id: `${fx.prefix}-entry-2`, operationKey: `${fx.prefix}-op` }),
        '23505',
      );
      await expectRejected(db, insertEntry(db, fx, { operationKey: '' }), '23514');
    });
  });

  it('separa referência ausente de vínculo entre estabelecimentos', async () => {
    const fx = createLedgerFixture();
    await withRolledBackTransaction(async (db) => {
      await seedLedgerFixture(db, fx);
      const parent = await db.query<{ venueId: string }>(
        'SELECT "venueId" FROM "CreditPurchase" WHERE id = $1',
        [fx.purchaseA],
      );
      expect(
        interpretCompositeForeignKey({
          constraint: 'CreditObligation_purchaseId_venueId_fkey',
          referencedVenueId: parent[0]?.venueId ?? null,
          requestedVenueId: fx.venueB,
        }),
      ).toBe('venue_mismatch');
      await expectRejected(
        db,
        insertObligation(db, fx, { venueId: fx.venueB }),
        '23503',
      );
      await db.query('ROLLBACK TO SAVEPOINT before_failure');

      const missing = await db.query<{ venueId: string }>(
        'SELECT "venueId" FROM "CreditPurchase" WHERE id = $1',
        [`${fx.prefix}-missing`],
      );
      expect(
        interpretCompositeForeignKey({
          constraint: 'CreditObligation_purchaseId_venueId_fkey',
          referencedVenueId: missing[0]?.venueId ?? null,
          requestedVenueId: fx.venueA,
        }),
      ).toBe('missing_reference');
      await expectRejected(
        db,
        insertObligation(db, fx, { purchaseId: `${fx.prefix}-missing` }),
        '23503',
      );
      await db.query('ROLLBACK TO SAVEPOINT before_failure');

      await expectRejected(
        db,
        insertEntry(db, fx, {
          operationKey: `${fx.prefix}-cross-redemption`,
          redemptionId: fx.redemptionB,
        }),
        '23503',
      );
      await db.query('ROLLBACK TO SAVEPOINT before_failure');
      await expectRejected(
        db,
        insertEntry(db, fx, {
          operationKey: `${fx.prefix}-cross-banner`,
          bannerId: fx.bannerB,
        }),
        '23503',
      );
    });
  });

  it('ON DELETE RESTRICT preserva o lançamento e o venueId', async () => {
    const fx = createLedgerFixture();
    await withRolledBackTransaction(async (db) => {
      await seedLedgerFixture(db, fx);
      await insertObligation(db, fx, {});
      await insertEntry(db, fx, {
        operationKey: `${fx.prefix}-history`,
        obligationId: `${fx.prefix}-ob`,
        bannerId: fx.bannerA,
      });
      await expectRestrict(db, 'DELETE FROM "CreditPurchase" WHERE id = $1', [fx.purchaseA]);
      await expectRestrict(db, 'DELETE FROM "Banner" WHERE id = $1', [fx.bannerA]);
      await expectRestrict(db, 'DELETE FROM "Venue" WHERE id = $1', [fx.venueA]);
      const rows = await db.query<{ venueId: string; bannerId: string }>(
        'SELECT "venueId", "bannerId" FROM "CreditLedgerEntry" WHERE "operationKey" = $1',
        [`${fx.prefix}-history`],
      );
      expect(rows).toEqual([{ venueId: fx.venueA, bannerId: fx.bannerA }]);
    });
  });

  it('insere obrigação e lançamento válidos e trata repetição idêntica', async () => {
    const fx = createLedgerFixture();
    await withRolledBackTransaction(async (db) => {
      await seedLedgerFixture(db, fx);
      const tx = createPostgresCreditLedgerTx(db);
      const first = await persistPlannedRefund(tx, refundInput(fx, 3), rowIds(fx));
      const second = await persistPlannedRefund(tx, refundInput(fx, 3), rowIds(fx));
      expect(first.status).toBe('inserted');
      expect(second.status).toBe('identical');
      expect(second.obligationId).toBe(first.obligationId);
      expect(await countByVenue(db, 'CreditObligation', fx.venueA)).toBe(1);
      expect(await countByVenue(db, 'CreditLedgerEntry', fx.venueA)).toBe(2);
      expect(await countByVenue(db, 'CreditWallet', fx.venueA)).toBe(0);
    });
  });

  it('repetição divergente e obrigação duplicada abortam sem segunda escrita', async () => {
    const fx = createLedgerFixture();
    await withRolledBackTransaction(async (db) => {
      await seedLedgerFixture(db, fx);
      const tx = createPostgresCreditLedgerTx(db);
      await persistPlannedRefund(tx, refundInput(fx, 3), rowIds(fx));
      await expect(persistPlannedRefund(tx, refundInput(fx, 5), rowIds(fx))).rejects.toMatchObject({
        reason: 'divergent',
      });
      expect(await countByVenue(db, 'CreditObligation', fx.venueA)).toBe(1);
      await expect(
        persistPlannedRefund(
          tx,
          { ...refundInput(fx, 3), venueId: fx.venueB },
          rowIds(fx),
        ),
      ).rejects.toMatchObject({ reason: 'venue_mismatch' });
    });
  });

  it('falha antes da escrita, após a obrigação e ao lançar, e a repetição posterior grava uma vez', async () => {
    const fx = createLedgerFixture();
    try {
      await expect(
        withIsolatedTransaction(async (db) => {
          await seedLedgerFixture(db, fx);
          throw new Error('before-write');
        }),
      ).rejects.toThrow('before-write');
      await withIsolatedTransaction(async (db) => {
        expect(await countByVenue(db, 'CreditObligation', fx.venueA)).toBe(0);
      });

      await withIsolatedTransaction(async (db) => {
        await seedLedgerFixture(db, fx);
      });
      await expect(
        withIsolatedTransaction(async (db) => {
          const tx = createPostgresCreditLedgerTx(
            failAfterQuery(db, 'INSERT INTO "CreditObligation"'),
          );
          await persistPlannedRefund(tx, refundInput(fx, 3), rowIds(fx));
        }),
      ).rejects.toThrow('injected');
      await expect(
        withIsolatedTransaction(async (db) => {
          const tx = createPostgresCreditLedgerTx(
            failOnQuery(db, 'INSERT INTO "CreditLedgerEntry"'),
          );
          await persistPlannedRefund(tx, refundInput(fx, 3), rowIds(fx));
        }),
      ).rejects.toThrow('injected');
      await withIsolatedTransaction(async (db) => {
        expect(await countByVenue(db, 'CreditObligation', fx.venueA)).toBe(0);
        expect(await countByVenue(db, 'CreditLedgerEntry', fx.venueA)).toBe(0);
        const tx = createPostgresCreditLedgerTx(db);
        const result = await persistPlannedRefund(tx, refundInput(fx, 3), rowIds(fx));
        expect(result.status).toBe('inserted');
        expect(await countByVenue(db, 'CreditObligation', fx.venueA)).toBe(1);
      });
    } finally {
      await withIsolatedTransaction(async (db) => {
        await deleteLedgerFixture(db, fx);
      });
    }
  });

  it('dois reembolsos de compras diferentes do mesmo estabelecimento persistem os dois', async () => {
    const fx = createLedgerFixture();
    await withRolledBackTransaction(async (db) => {
      await seedLedgerFixture(db, fx);
      const tx = createPostgresCreditLedgerTx(db);
      const first = await persistPlannedRefund(tx, refundInput(fx, 5), rowIds(fx));
      const second = await persistPlannedRefund(
        tx,
        { ...refundInput(fx, 1), purchaseId: fx.purchaseB },
        rowIds(fx),
      );
      expect(first.status).toBe('inserted');
      expect(second.status).toBe('inserted');
      expect(await countByVenue(db, 'CreditObligation', fx.venueA)).toBe(1);
      expect(await countByVenue(db, 'CreditLedgerEntry', fx.venueA)).toBe(3);
      expect(await countByVenue(db, 'CreditWallet', fx.venueA)).toBe(0);
    });
  });

  it('duas transações na mesma compra e na mesma operationKey conflitam uma vez', async () => {
    const fx = createLedgerFixture();
    try {
      await withIsolatedTransaction(async (db) => {
        await seedLedgerFixture(db, fx);
      });
      const refunds = await Promise.all([
        withIsolatedTransaction(async (db) =>
          persistPlannedRefund(createPostgresCreditLedgerTx(db), refundInput(fx, 3), rowIds(fx)),
        ),
        withIsolatedTransaction(async (db) =>
          persistPlannedRefund(createPostgresCreditLedgerTx(db), refundInput(fx, 3), rowIds(fx)),
        ),
      ]);
      expect(refunds.map((result) => result.status).sort()).toEqual(['identical', 'inserted']);
      const entry = ledgerEntry(fx, `${fx.prefix}-shared-key`);
      const writes = await Promise.allSettled([
        withIsolatedTransaction(async (db) => {
          await createPostgresCreditLedgerTx(db).insertEntry({ ...entry, id: `${fx.prefix}-e1` });
        }),
        withIsolatedTransaction(async (db) => {
          await createPostgresCreditLedgerTx(db).insertEntry({ ...entry, id: `${fx.prefix}-e2` });
        }),
      ]);
      const rejected = writes.filter((result) => result.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ reason: 'divergent' });
      await withIsolatedTransaction(async (db) => {
        expect(await countByVenue(db, 'CreditObligation', fx.venueA)).toBe(1);
        expect(await countByVenue(db, 'CreditLedgerEntry', fx.venueA)).toBe(3);
      });
    } finally {
      await withIsolatedTransaction(async (db) => {
        await deleteLedgerFixture(db, fx);
      });
    }
  });

  it('locks seguem a ordem ordenada e não escrevem a carteira', async () => {
    const fx = createLedgerFixture();
    await withRolledBackTransaction(async (db) => {
      await seedLedgerFixture(db, fx);
      const seen: string[] = [];
      const recording: IsolatedSql = {
        query: async (text, params) => {
          seen.push(text);
          return db.query(text, params);
        },
      };
      await createPostgresCreditLedgerTx(recording).lock([
        `venue:${fx.venueA}`,
        `purchase:${fx.purchaseA}`,
      ]);
      const locks = seen.filter((text) => text.includes('FOR UPDATE'));
      expect(locks[0]).toContain('"CreditPurchase"');
      expect(locks[1]).toContain('"Venue"');
      expect(seen.join('\n')).not.toContain('"CreditWallet"');
    });
  });

  it('deadlock de ordem invertida aborta sem repetir o reembolso', async () => {
    const fx = createLedgerFixture();
    try {
      await withIsolatedTransaction(async (db) => {
        await seedLedgerFixture(db, fx);
      });
      const purchaseLocked = deferred();
      const venueLocked = deferred();
      const results = await Promise.allSettled([
        withIsolatedTransaction(async (db) => {
          await db.query('SELECT id FROM "CreditPurchase" WHERE id = $1 FOR UPDATE', [fx.purchaseA]);
          purchaseLocked.resolve();
          await venueLocked.promise;
          await db.query('SELECT id FROM "Venue" WHERE id = $1 FOR UPDATE', [fx.venueA]);
        }),
        withIsolatedTransaction(async (db) => {
          await purchaseLocked.promise;
          await db.query('SELECT id FROM "Venue" WHERE id = $1 FOR UPDATE', [fx.venueA]);
          venueLocked.resolve();
          await db.query('SELECT id FROM "CreditPurchase" WHERE id = $1 FOR UPDATE', [fx.purchaseA]);
        }),
      ]);
      expect(results.some((result) => result.status === 'rejected' && sqlState(result.reason) === '40P01')).toBe(
        true,
      );
      await withIsolatedTransaction(async (db) => {
        expect(await countByVenue(db, 'CreditObligation', fx.venueA)).toBe(0);
        expect(await countByVenue(db, 'CreditLedgerEntry', fx.venueA)).toBe(0);
      });
    } finally {
      await withIsolatedTransaction(async (db) => {
        await deleteLedgerFixture(db, fx);
      });
    }
  }, 15000);
});

function refundInput(fx: LedgerFixture, balance: number) {
  return {
    purchaseId: fx.purchaseA,
    venueId: fx.venueA,
    purchaseCredits: 5,
    balance,
    source: 'pix_full_refund' as const,
  };
}

function rowIds(fx: LedgerFixture): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${fx.prefix}-row-${n}`;
  };
}

function ledgerEntry(fx: LedgerFixture, operationKey: string): StoredLedgerEntry {
  return {
    id: `${fx.prefix}-entry`,
    operationKey,
    venueId: fx.venueA,
    purchaseId: fx.purchaseA,
    obligationId: null,
    kind: 'clawback',
    credits: 5,
    availableDelta: -5,
    debtDelta: 0,
  };
}

async function insertObligation(
  db: IsolatedSql,
  fx: LedgerFixture,
  overrides: {
    id?: string;
    venueId?: string;
    purchaseId?: string;
    creditsOriginal?: number;
    creditsRecovered?: number;
    creditsOpened?: number;
    creditsSettled?: number;
    status?: string;
    source?: string;
  },
): Promise<void> {
  const row = {
    id: `${fx.prefix}-ob`,
    venueId: fx.venueA,
    purchaseId: fx.purchaseA,
    creditsOriginal: 5,
    creditsRecovered: 3,
    creditsOpened: 2,
    creditsSettled: 0,
    status: 'open',
    source: 'pix_full_refund',
    ...overrides,
  };
  await db.query('SAVEPOINT before_failure');
  await db.query(
    `INSERT INTO "CreditObligation" (
       "id", "venueId", "purchaseId", "creditsOriginal", "creditsRecovered",
       "creditsOpened", "creditsSettled", "status", "source", "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
    [
      row.id,
      row.venueId,
      row.purchaseId,
      row.creditsOriginal,
      row.creditsRecovered,
      row.creditsOpened,
      row.creditsSettled,
      row.status,
      row.source,
      new Date('2026-10-13T00:00:00.000Z'),
    ],
  );
}

async function insertEntry(
  db: IsolatedSql,
  fx: LedgerFixture,
  overrides: {
    id?: string;
    operationKey?: string;
    venueId?: string;
    purchaseId?: string | null;
    obligationId?: string | null;
    redemptionId?: string | null;
    bannerId?: string | null;
  },
): Promise<void> {
  const row = {
    id: `${fx.prefix}-entry`,
    operationKey: `${fx.prefix}-op`,
    venueId: fx.venueA,
    purchaseId: fx.purchaseA as string | null,
    obligationId: null as string | null,
    redemptionId: null as string | null,
    bannerId: null as string | null,
    ...overrides,
  };
  await db.query('SAVEPOINT before_failure');
  await db.query(
    `INSERT INTO "CreditLedgerEntry" (
       "id", "venueId", "operationKey", "kind", "purchaseId", "obligationId",
       "redemptionId", "bannerId", "credits", "availableDelta", "debtDelta", "createdAt"
     ) VALUES ($1, $2, $3, 'clawback', $4, $5, $6, $7, 1, -1, 0, $8)`,
    [
      row.id,
      row.venueId,
      row.operationKey,
      row.purchaseId,
      row.obligationId,
      row.redemptionId,
      row.bannerId,
      new Date('2026-10-13T00:00:00.000Z'),
    ],
  );
}

async function expectRejected(db: IsolatedSql, action: Promise<void>, code: string): Promise<void> {
  try {
    await action;
    throw new Error(`expected SQLSTATE ${code}`);
  } catch (error) {
    if (error instanceof Error && error.message === `expected SQLSTATE ${code}`) throw error;
    expect(sqlState(error)).toBe(code);
    await db.query('ROLLBACK TO SAVEPOINT before_failure');
  }
}

async function expectRestrict(db: IsolatedSql, text: string, params: readonly unknown[]): Promise<void> {
  await db.query('SAVEPOINT before_failure');
  try {
    await db.query(text, params);
    throw new Error('delete should have been restricted');
  } catch (error) {
    if (error instanceof Error && error.message === 'delete should have been restricted') throw error;
    expect(isRestrictViolation(error)).toBe(true);
    await db.query('ROLLBACK TO SAVEPOINT before_failure');
  }
}
