import { createHmac, randomUUID } from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PurchaseStatus } from '@prisma/client';
import { VENUE_SIGNUP_BONUS_CREDITS } from '../common/constants/credits';
import { VenueDocument } from '../venues/venue-document';

export const WELCOME_CREDIT_HMAC_SECRET_KEY = 'WELCOME_CREDIT_HMAC_SECRET';
/** Included in the HMAC. Changing it makes every previous document look new. */
export const WELCOME_CREDIT_KEY_VERSION = 'v1';
const MIN_SECRET_LENGTH = 32;

/**
 * Same secret on every API instance. No production default and no fallback to
 * JWT_SECRET or the Mercado Pago webhook secret. A missing or short secret
 * refuses the venue signup instead of granting a bonus that could not be
 * recognized later.
 */
export function readWelcomeCreditSecret(
  config: Pick<ConfigService, 'get'> | undefined,
  unavailable = 'Não foi possível concluir o cadastro agora.',
): string {
  const secret = config?.get<string>(WELCOME_CREDIT_HMAC_SECRET_KEY)?.trim() ?? '';
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new ServiceUnavailableException(unavailable);
  }
  return secret;
}

export function welcomeCreditDocumentKey(secret: string, document: VenueDocument): string {
  return createHmac('sha256', secret)
    .update(`${WELCOME_CREDIT_KEY_VERSION}:${document.documentType}:${document.documentDigits}`)
    .digest('hex');
}

/**
 * Inserts the proof only when this document has never received the benefit.
 * ON CONFLICT does not abort the surrounding transaction. An empty result
 * means the account may still be created, with no welcome credit.
 */
export async function reserveWelcomeCredit(
  tx: Prisma.TransactionClient,
  document: VenueDocument,
  secret: string,
): Promise<{ id: string } | null> {
  const id = randomUUID();
  const documentKey = welcomeCreditDocumentKey(secret, document);
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "WelcomeCreditClaim"
      ("id", "documentKey", "documentType", "creditsGranted", "grantedAt")
    VALUES (
      ${id},
      ${documentKey},
      CAST(${document.documentType} AS "VenueDocumentType"),
      ${VENUE_SIGNUP_BONUS_CREDITS},
      NOW()
    )
    ON CONFLICT ("documentKey") DO NOTHING
    RETURNING "id"
  `;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const claimId = rows[0]?.id;
  if (rows.length !== 1 || typeof claimId !== 'string' || claimId.length === 0) {
    throw new Error('welcome claim confirmation failed');
  }
  return { id: claimId };
}

export type HistoricalLinkResult = 'linked' | 'already_claimed';

export type WelcomeCreditReconcileReport = {
  examined: number;
  withoutDocument: number;
  withoutWelcomeEvidence: number;
  linked: number;
  alreadyClaimed: number;
};

type HistoricalTx = {
  creditPurchase: {
    findMany(args: {
      where: { venueId: string; packageKey: string };
      select: { credits: true };
    }): Promise<Array<{ credits: number }>>;
  };
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

const DOCUMENT_SAVE_UNAVAILABLE = 'Não foi possível salvar o documento agora.';

/** Sum of historical welcome purchases. Zero means there is nothing to link. */
export async function historicalWelcomeCredits(
  tx: Pick<HistoricalTx, 'creditPurchase'>,
  venueId: string,
): Promise<number> {
  const rows = await tx.creditPurchase.findMany({
    where: { venueId, packageKey: 'welcome' },
    select: { credits: true },
  });
  if (rows.length === 0) return 0;
  const credits = rows.reduce((sum, row) => sum + row.credits, 0);
  if (!Number.isInteger(credits) || credits < 1) {
    throw new ServiceUnavailableException(DOCUMENT_SAVE_UNAVAILABLE);
  }
  return credits;
}

type ProvisionTx = Pick<HistoricalTx, 'creditPurchase'> & {
  welcomeCreditVenueProvision?: {
    findUnique(args: {
      where: { venueId: string };
      select: { creditsGranted: true };
    }): Promise<{ creditsGranted: number } | null>;
  };
  $executeRaw?(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
};

/**
 * Credits already granted to this venue and eligible for document linking.
 * Uses the welcome purchase when present; otherwise the provisional venue row.
 */
export async function welcomeCreditsForDocumentLink(
  tx: ProvisionTx,
  venueId: string,
): Promise<number> {
  const purchased = await historicalWelcomeCredits(tx, venueId).catch((error) => {
    if (error instanceof ServiceUnavailableException) return 0;
    throw error;
  });
  if (purchased > 0) return purchased;
  const provision = await tx.welcomeCreditVenueProvision?.findUnique({
    where: { venueId },
    select: { creditsGranted: true },
  });
  return provision?.creditsGranted ?? 0;
}

/**
 * Persistent proof that this venue already received provisional welcome credit
 * without a fiscal document. Idempotent per venueId.
 *
 * Anti-fraud before a document exists is limited to one row per venue (and the
 * wallet/purchase already written in the same transaction). CPF/CNPJ binding
 * only blocks repeat grants after the document is saved; it is not proof of
 * identity until then.
 */
export async function recordWelcomeVenueProvision(
  tx: Prisma.TransactionClient,
  venueId: string,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "WelcomeCreditVenueProvision" ("venueId", "creditsGranted", "grantedAt")
    VALUES (${venueId}, ${VENUE_SIGNUP_BONUS_CREDITS}, NOW())
    ON CONFLICT ("venueId") DO NOTHING
  `;
}

/**
 * Marks a document as already used because this venue has a welcome purchase.
 * ON CONFLICT leaves the existing row, including its origin and quantity.
 * The caller must not grant credits or write a new purchase around this insert.
 */
export async function linkHistoricalWelcomeClaim(
  tx: Pick<HistoricalTx, '$queryRaw'>,
  document: VenueDocument,
  secret: string,
  originVenueId: string,
  creditsGranted: number,
): Promise<HistoricalLinkResult> {
  if (!Number.isInteger(creditsGranted) || creditsGranted < 1) {
    throw new ServiceUnavailableException(DOCUMENT_SAVE_UNAVAILABLE);
  }
  const id = randomUUID();
  const documentKey = welcomeCreditDocumentKey(secret, document);
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "WelcomeCreditClaim" (
      "id",
      "documentKey",
      "documentType",
      "creditsGranted",
      "grantedAt",
      "originVenueId",
      "source"
    )
    VALUES (
      ${id},
      ${documentKey},
      CAST(${document.documentType} AS "VenueDocumentType"),
      ${creditsGranted},
      NOW(),
      ${originVenueId},
      'HISTORICAL'::"WelcomeCreditSource"
    )
    ON CONFLICT ("documentKey") DO NOTHING
    RETURNING "id"
  `;
  if (!Array.isArray(rows) || rows.length === 0) return 'already_claimed';
  if (rows.length !== 1 || typeof rows[0]?.id !== 'string') {
    throw new ServiceUnavailableException(DOCUMENT_SAVE_UNAVAILABLE);
  }
  return 'linked';
}

type ReconcileDb = HistoricalTx & {
  venue: {
    count(args: {
      where: { OR: Array<{ documentType: null } | { documentDigits: null }> };
    }): Promise<number>;
    findMany(args: {
      where: { documentType: { not: null }; documentDigits: { not: null } };
      select: { id: true; documentType: true; documentDigits: true };
    }): Promise<
      Array<{ id: string; documentType: 'CPF' | 'CNPJ' | null; documentDigits: string | null }>
    >;
  };
  $transaction<T>(fn: (tx: HistoricalTx) => Promise<T>): Promise<T>;
};

/**
 * Links venues that already have a document and a welcome purchase.
 * Idempotent. Does not grant credit, change a balance, or replace a claim.
 * Callers run this only in an authorized test environment.
 */
export async function reconcileHistoricalWelcomeClaims(
  db: ReconcileDb,
  secret: string,
): Promise<WelcomeCreditReconcileReport> {
  const report: WelcomeCreditReconcileReport = {
    examined: 0,
    withoutDocument: await db.venue.count({
      where: { OR: [{ documentType: null }, { documentDigits: null }] },
    }),
    withoutWelcomeEvidence: 0,
    linked: 0,
    alreadyClaimed: 0,
  };
  const venues = await db.venue.findMany({
    where: { documentType: { not: null }, documentDigits: { not: null } },
    select: { id: true, documentType: true, documentDigits: true },
  });
  for (const venue of venues) {
    report.examined += 1;
    if (venue.documentType !== 'CPF' && venue.documentType !== 'CNPJ') continue;
    if (!venue.documentDigits) continue;
    const document = {
      documentType: venue.documentType,
      documentDigits: venue.documentDigits,
    };
    await db.$transaction(async (tx) => {
      const credits = await welcomeCreditsForDocumentLink(tx, venue.id);
      if (credits < 1) {
        report.withoutWelcomeEvidence += 1;
        return;
      }
      const result = await linkHistoricalWelcomeClaim(
        tx,
        document,
        secret,
        venue.id,
        credits,
      );
      if (result === 'linked') report.linked += 1;
      else report.alreadyClaimed += 1;
    });
  }
  return report;
}

const REFUSED_RECONCILE_HOSTS = ['railway', 'rlwy', 'amazonaws', 'neon', 'supabase', 'render'];

/** Refuses production and any database other than the local disposable Postgres. */
export function assertWelcomeReconcileAuthorized(
  env: Record<string, string | undefined>,
): string {
  if (env.NODE_ENV === 'production') {
    throw new Error('reconciliação recusada em produção');
  }
  if (env.WELCOME_CREDIT_RECONCILE !== 'authorized') {
    throw new Error('reconciliação não autorizada');
  }
  const url = env.WELCOME_CREDIT_RECONCILE_DATABASE_URL ?? '';
  const host = url.toLowerCase();
  if (REFUSED_RECONCILE_HOSTS.some((marker) => host.includes(marker))) {
    throw new Error('reconciliação recusada: host remoto');
  }
  if (!host.includes('127.0.0.1:55432/after_credit_ledger_test')) {
    throw new Error('reconciliação recusada: só o PostgreSQL descartável local');
  }
  return url;
}

/** Wallet credit is written by the caller. This records the purchase and the origin. */
export async function confirmWelcomeCredit(
  tx: Prisma.TransactionClient,
  claimId: string,
  venueId: string,
): Promise<void> {
  await tx.creditPurchase.create({
    data: {
      venueId,
      packageKey: 'welcome',
      amountPaid: 0,
      credits: VENUE_SIGNUP_BONUS_CREDITS,
      status: PurchaseStatus.PAID,
      confirmedAt: new Date(),
    },
  });
  const updated = await tx.welcomeCreditClaim.updateMany({
    where: { id: claimId, originVenueId: null },
    data: { originVenueId: venueId },
  });
  if (updated.count !== 1) {
    throw new Error('welcome claim confirmation failed');
  }
}
