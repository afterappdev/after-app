import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');
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

function modelBlock(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) throw new Error(`model ${name} missing`);
  const end = schema.indexOf('\nmodel ', start + 1);
  return end < 0 ? schema.slice(start) : schema.slice(start, end);
}

describe('credit obligation schema', () => {
  it('declara os dois modelos inativos e preserva a carteira', () => {
    const obligation = modelBlock('CreditObligation');
    const ledger = modelBlock('CreditLedgerEntry');
    const wallet = modelBlock('CreditWallet');

    expect(obligation).toMatch(/purchaseId\s+String\s+@unique/);
    expect(ledger).toMatch(/operationKey\s+String\s+@unique/);
    expect(obligation).toContain('@@index([venueId, status, createdAt])');
    expect(ledger).toContain('@@index([venueId, createdAt])');
    expect(obligation).toContain('onDelete: Restrict');
    expect(wallet).toMatch(/balance\s+Int\s+@default\(0\)/);
    expect(wallet).toMatch(/vipBalance\s+Int\s+@default\(0\)/);
    expect(schema).toMatch(/@@unique\(\[purchaseId,\s*kind\]\)/);
  });

  it('a migration só cria tabelas, índices e checks', () => {
    expect(migration).toContain('CREATE TABLE "CreditObligation"');
    expect(migration).toContain('CREATE TABLE "CreditLedgerEntry"');
    expect(migration).toContain('"CreditObligation_purchaseId_key"');
    expect(migration).toContain('"CreditLedgerEntry_operationKey_key"');
    expect(migration).toContain('"creditsRecovered" + "creditsOpened" = "creditsOriginal"');
    expect(migration).toContain('"creditsSettled" <= "creditsOpened"');
    expect(migration).toContain('ON DELETE RESTRICT');
    expect(migration).not.toMatch(/^\s*INSERT\b/im);
    expect(migration).not.toMatch(/^\s*UPDATE\b/im);
    expect(migration).not.toMatch(/^\s*CREATE\s+TRIGGER\b/im);
    expect(migration).not.toContain('CreditWallet');
    expect(migration).not.toContain('shortfall');
    expect(migration).not.toContain('ON DELETE SET NULL');
  });

  it('amarra obrigação e lançamento ao estabelecimento da entidade referenciada', () => {
    expect(schema).toContain('fields: [purchaseId, venueId], references: [id, venueId], onDelete: Restrict');
    expect(schema).toContain('fields: [obligationId, venueId], references: [id, venueId], onDelete: Restrict');
    expect(schema).toContain('fields: [redemptionId, venueId], references: [id, venueId], onDelete: Restrict');
    expect(schema).toContain('fields: [bannerId, venueId], references: [id, venueId], onDelete: Restrict');
    expect(schema).toContain('@@unique([id, venueId])');
    const ledger = modelBlock('CreditLedgerEntry');
    const obligation = modelBlock('CreditObligation');
    expect(ledger).not.toContain('SetNull');
    expect(obligation).not.toContain('SetNull');
    for (const clause of [
      'FOREIGN KEY ("purchaseId", "venueId") REFERENCES "CreditPurchase"("id", "venueId") ON DELETE RESTRICT',
      'FOREIGN KEY ("obligationId", "venueId") REFERENCES "CreditObligation"("id", "venueId") ON DELETE RESTRICT',
      'FOREIGN KEY ("redemptionId", "venueId") REFERENCES "CreditCouponRedemption"("id", "venueId") ON DELETE RESTRICT',
      'FOREIGN KEY ("bannerId", "venueId") REFERENCES "Banner"("id", "venueId") ON DELETE RESTRICT',
    ]) {
      expect(migration).toContain(clause);
    }
    expect(migration.match(/purchaseId_venueId_fkey/g)).toHaveLength(2);
  });

  it('serviços de domínio não escrevem no ledger; obrigação só no fluxo VIP de estorno', () => {
    const ledgerOnlyForbidden = [
      'src/credits/card-refund.ledger.ts',
      'src/credits/providers/pix.provider.ts',
      'src/banners/banners.service.ts',
      'src/coupons/coupons.service.ts',
      'src/admin/finance.ts',
    ];
    for (const file of ledgerOnlyForbidden) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source).not.toContain('CreditObligation');
      expect(source).not.toContain('CreditLedgerEntry');
      expect(source).not.toContain('creditObligation');
      expect(source).not.toContain('creditLedgerEntry');
    }
    const credits = readFileSync(join(root, 'src/credits/credits.service.ts'), 'utf8');
    expect(credits).toContain('creditObligation.create');
    expect(credits).not.toContain('creditLedgerEntry');
    expect(credits).not.toContain('CreditLedgerEntry');
  });
});
