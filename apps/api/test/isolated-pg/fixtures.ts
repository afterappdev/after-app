import type { IsolatedSql } from '../../src/credits/credit-ledger.pg';

/** Fictional rows. Identifiers have no colon so ledger keys stay valid. */
export type LedgerFixture = {
  prefix: string;
  userA: string;
  userB: string;
  venueA: string;
  venueB: string;
  purchaseA: string;
  purchaseB: string;
  couponId: string;
  redemptionA: string;
  redemptionB: string;
  bannerA: string;
  bannerB: string;
};

let sequence = 0;

export function createLedgerFixture(): LedgerFixture {
  sequence += 1;
  const prefix = `clt${sequence}`;
  return {
    prefix,
    userA: `${prefix}-user-a`,
    userB: `${prefix}-user-b`,
    venueA: `${prefix}-venue-a`,
    venueB: `${prefix}-venue-b`,
    purchaseA: `${prefix}-purchase-a`,
    purchaseB: `${prefix}-purchase-b`,
    couponId: `${prefix}-coupon`,
    redemptionA: `${prefix}-redemption-a`,
    redemptionB: `${prefix}-redemption-b`,
    bannerA: `${prefix}-banner-a`,
    bannerB: `${prefix}-banner-b`,
  };
}

const STAMP = new Date('2026-10-13T00:00:00.000Z');

export async function seedLedgerFixture(db: IsolatedSql, fx: LedgerFixture): Promise<void> {
  await insertUser(db, fx.userA);
  await insertUser(db, fx.userB);
  await insertVenue(db, fx.venueA, fx.userA, 'Estabelecimento fictício A');
  await insertVenue(db, fx.venueB, fx.userB, 'Estabelecimento fictício B');
  await insertPurchase(db, fx.purchaseA, fx.venueA);
  await insertPurchase(db, fx.purchaseB, fx.venueA);
  await db.query(
    `INSERT INTO "CreditCoupon" ("id", "code", "creditAmount", "createdAt", "updatedAt")
     VALUES ($1, $2, 2, $3, $3)`,
    [fx.couponId, `${fx.prefix}-CODE`, STAMP],
  );
  await insertRedemption(db, fx.redemptionA, fx.couponId, fx.venueA);
  await insertRedemption(db, fx.redemptionB, fx.couponId, fx.venueB);
  await insertBanner(db, fx.bannerA, fx.venueA);
  await insertBanner(db, fx.bannerB, fx.venueB);
}

export async function deleteLedgerFixture(db: IsolatedSql, fx: LedgerFixture): Promise<void> {
  const venues = [fx.venueA, fx.venueB];
  await db.query('DELETE FROM "CreditLedgerEntry" WHERE "venueId" = ANY($1::text[])', [venues]);
  await db.query('DELETE FROM "CreditObligation" WHERE "venueId" = ANY($1::text[])', [venues]);
  await db.query('DELETE FROM "CreditCouponRedemption" WHERE "id" = ANY($1::text[])', [
    [fx.redemptionA, fx.redemptionB],
  ]);
  await db.query('DELETE FROM "Banner" WHERE "id" = ANY($1::text[])', [[fx.bannerA, fx.bannerB]]);
  await db.query('DELETE FROM "CreditPurchase" WHERE "id" = ANY($1::text[])', [
    [fx.purchaseA, fx.purchaseB],
  ]);
  await db.query('DELETE FROM "CreditWallet" WHERE "venueId" = ANY($1::text[])', [venues]);
  await db.query('DELETE FROM "CreditCoupon" WHERE "id" = $1', [fx.couponId]);
  await db.query('DELETE FROM "Venue" WHERE "id" = ANY($1::text[])', [venues]);
  await db.query('DELETE FROM "User" WHERE "id" = ANY($1::text[])', [[fx.userA, fx.userB]]);
}

export async function countByVenue(
  db: IsolatedSql,
  table: 'CreditObligation' | 'CreditLedgerEntry' | 'CreditWallet',
  venueId: string,
): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM "${table}" WHERE "venueId" = $1`,
    [venueId],
  );
  return Number(rows[0]?.n ?? 0);
}

async function insertUser(db: IsolatedSql, id: string): Promise<void> {
  await db.query(
    `INSERT INTO "User"
       ("id", "name", "email", "passwordHash", "role", "state", "city", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'USER', 'SP', 'Campinas', $5, $5)`,
    [id, 'Usuário fictício', `${id}@example.test`, 'fixture-not-a-credential', STAMP],
  );
}

async function insertVenue(db: IsolatedSql, id: string, ownerUserId: string, name: string): Promise<void> {
  await db.query(
    `INSERT INTO "Venue" ("id", "ownerUserId", "name", "city", "state", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'Campinas', 'SP', $4, $4)`,
    [id, ownerUserId, name, STAMP],
  );
}

async function insertPurchase(db: IsolatedSql, id: string, venueId: string): Promise<void> {
  await db.query(
    `INSERT INTO "CreditPurchase"
       ("id", "venueId", "packageKey", "amountPaid", "currency", "credits", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, 'combo_5', 149.90, 'BRL', 5, 'PAID', $3, $3)`,
    [id, venueId, STAMP],
  );
}

async function insertRedemption(
  db: IsolatedSql,
  id: string,
  couponId: string,
  venueId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO "CreditCouponRedemption"
       ("id", "couponId", "venueId", "venueNameSnapshot", "creditAmount")
     VALUES ($1, $2, $3, 'Estabelecimento fictício', 2)`,
    [id, couponId, venueId],
  );
}

async function insertBanner(db: IsolatedSql, id: string, venueId: string): Promise<void> {
  await db.query(
    `INSERT INTO "Banner"
       ("id", "venueId", "imageUrl", "creditsCost", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, 'https://example.test/banner.png', 1, 'ACTIVE', $3, $3)`,
    [id, venueId, STAMP],
  );
}
