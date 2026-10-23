import { readFileSync } from 'fs';
import { join } from 'path';
import {
  IsolatedPgDeadlock,
  createPostgresCreditLedgerTx,
  interpretCompositeForeignKey,
  translateCreditLedgerDbError,
  type IsolatedSql,
} from './credit-ledger.pg';
import { CreditLedgerError, type StoredObligation } from './credit-ledger.persist';

function obligation(): StoredObligation {
  return {
    id: 'ob-1',
    purchaseId: 'purchase-a',
    venueId: 'venue-1',
    creditsOriginal: 5,
    creditsRecovered: 3,
    creditsOpened: 2,
    creditsSettled: 0,
    status: 'open',
    source: 'pix_full_refund',
  };
}

describe('credit ledger postgres adapter', () => {
  it('trava compra e estabelecimento em ordem, sem escrever a carteira', async () => {
    const texts: string[] = [];
    const db: IsolatedSql = {
      query: async (text, params) => {
        texts.push(`${text} :: ${params.join(',')}`);
        return [];
      },
    };
    const tx = createPostgresCreditLedgerTx(db);
    await tx.lock(['venue:venue-1', 'purchase:purchase-a']);
    expect(texts[0]).toContain('"CreditPurchase"');
    expect(texts[0]).toContain('FOR UPDATE');
    expect(texts[1]).toContain('"Venue"');
    expect(texts.join('\n')).not.toContain('"CreditWallet"');
    expect(texts.join('\n')).not.toMatch(/UPDATE\s+"CreditWallet"/);
  });

  it('insere a obrigação com updatedAt e traduz conflito único sem repetir', async () => {
    let inserts = 0;
    const db: IsolatedSql = {
      query: async (text) => {
        if (text.includes('INSERT INTO "CreditObligation"')) {
          inserts += 1;
          expect(text).toContain('"updatedAt"');
          throw { code: '23505' };
        }
        return [];
      },
    };
    const tx = createPostgresCreditLedgerTx(db);
    await expect(tx.insertObligation(obligation())).rejects.toMatchObject({
      reason: 'divergent',
    });
    expect(inserts).toBe(1);
    expect(translateCreditLedgerDbError({ code: 'P2002' })).toBeInstanceOf(CreditLedgerError);
  });

  it('deadlock aborta na primeira falha', async () => {
    let calls = 0;
    const db: IsolatedSql = {
      query: async () => {
        calls += 1;
        throw { code: '40P01' };
      },
    };
    const tx = createPostgresCreditLedgerTx(db);
    await expect(tx.lock(['purchase:purchase-a', 'venue:venue-1'])).rejects.toBeInstanceOf(
      IsolatedPgDeadlock,
    );
    expect(calls).toBe(1);
  });

  it('não trata toda chave estrangeira como estabelecimento cruzado', async () => {
    const db: IsolatedSql = {
      query: async () => {
        throw { code: '23503' };
      },
    };
    const tx = createPostgresCreditLedgerTx(db);
    await expect(tx.purchaseVenue('purchase-a')).rejects.toMatchObject({
      reason: 'unresolved_reference',
    });
    expect(
      translateCreditLedgerDbError({
        code: '23503',
        constraint: 'CreditObligation_venueId_fkey',
      }),
    ).toMatchObject({ reason: 'missing_reference' });
    expect(
      translateCreditLedgerDbError({
        code: 'P2003',
        constraint: 'CreditObligation_purchaseId_venueId_fkey',
      }),
    ).toMatchObject({ reason: 'unresolved_reference' });
    expect(
      interpretCompositeForeignKey({
        constraint: 'CreditObligation_purchaseId_venueId_fkey',
        referencedVenueId: 'venue-1',
        requestedVenueId: 'venue-2',
      }),
    ).toBe('venue_mismatch');
    expect(
      interpretCompositeForeignKey({
        constraint: 'CreditObligation_purchaseId_venueId_fkey',
        referencedVenueId: null,
        requestedVenueId: 'venue-2',
      }),
    ).toBe('missing_reference');
    expect(
      interpretCompositeForeignKey({
        constraint: 'CreditObligation_venueId_fkey',
        referencedVenueId: 'venue-1',
        requestedVenueId: 'venue-2',
      }),
    ).toBe('missing_reference');
    const source = readFileSync(join(__dirname, 'credit-ledger.pg.ts'), 'utf8');
    expect(source).not.toContain('@prisma/client');
    expect(source).not.toContain('PrismaClient');
    expect(source).not.toContain('DATABASE_URL');
    expect(source).not.toContain('BEGIN');
    expect(source).not.toContain('UPDATE "CreditWallet"');
  });
});
