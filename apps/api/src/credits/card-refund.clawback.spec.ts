import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CARD_FULL_REFUND_RECOVERABLE_SQL,
  recoverableCardCredits,
} from './card-refund.ledger';

describe('card full refund clawback', () => {
  it('a SQL de produção debita só LEAST(GREATEST(balance, 0), credits)', () => {
    const source = readFileSync(join(__dirname, 'card-refund.ledger.ts'), 'utf8');
    const assignment = `w.balance - ${CARD_FULL_REFUND_RECOVERABLE_SQL}`;
    expect(CARD_FULL_REFUND_RECOVERABLE_SQL).toBe('LEAST(GREATEST(w.balance, 0),');
    expect(source.split(assignment).length - 1).toBe(1);
    expect(source).not.toContain('LEAST(w.balance,');
  });

  it.each([
    [10, 5, 5],
    [5, 5, 5],
    [3, 5, 3],
    [0, 5, 0],
    [-2, 5, 0],
    [-5, 10, 0],
  ])('saldo %s e pacote %s recuperam %s', (balance, credits, recovered) => {
    expect(recoverableCardCredits(balance, credits)).toBe(recovered);
    expect(recovered).toBeGreaterThanOrEqual(0);
    expect(balance - recovered).toBeLessThanOrEqual(balance);
  });
});
