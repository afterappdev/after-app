import { isolatedSuiteRunAuthorized } from '../../src/credits/isolated-pg-guard';
import { withIsolatedTransaction } from './session';

const suite = isolatedSuiteRunAuthorized(process.env) ? describe : describe.skip;

suite('account soft delete isolated postgres', () => {
  it('schema inclui colunas de lifecycle e purge job', async () => {
    await withIsolatedTransaction(async (db) => {
      const userCols = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'User'
           AND column_name IN (
             'accountStatus',
             'deletionRequestedAt',
             'permanentDeletionAt',
             'sessionVersion'
           )`,
      );
      expect(userCols.map((r) => r.column_name).sort()).toEqual([
        'accountStatus',
        'deletionRequestedAt',
        'permanentDeletionAt',
        'sessionVersion',
      ]);

      const jobCols = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'AccountPurgeJob'
           AND column_name IN (
             'lockedUntil',
             'lockedBy',
             'progressStage',
             'uploadManifest',
             'leaseEpoch'
           )`,
      );
      expect(jobCols.map((r) => r.column_name).sort()).toEqual([
        'leaseEpoch',
        'lockedBy',
        'lockedUntil',
        'progressStage',
        'uploadManifest',
      ]);
    });
  });
});
