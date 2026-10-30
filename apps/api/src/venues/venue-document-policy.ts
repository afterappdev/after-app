import { createHash } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma, VenueDocumentType } from '@prisma/client';
import { VENUE_DOCUMENT_TAKEN } from './venue-document';

function documentAdvisoryLockKey(
  documentType: VenueDocumentType,
  documentDigits: string,
): bigint {
  const digest = createHash('sha256')
    .update(`after-venue-doc:${documentType}:${documentDigits}`)
    .digest();
  return digest.readBigInt64BE(0);
}

async function lockDocumentIdentity(
  tx: Prisma.TransactionClient,
  document: VenueDocumentIdentity,
): Promise<void> {
  const key = documentAdvisoryLockKey(
    document.documentType,
    document.documentDigits,
  );
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
}

export type VenueDocumentIdentity = {
  documentType: VenueDocumentType;
  documentDigits: string;
};

/**
 * Blocks assigning a fiscal document already used by another account.
 * Same owner may reuse the document on multiple venues.
 * Uses row locks on matching venues to reduce cross-request races.
 */
export async function assertVenueDocumentAvailableForOwner(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  document: VenueDocumentIdentity,
  excludeVenueId?: string,
): Promise<void> {
  await lockDocumentIdentity(tx, document);
  const rows = excludeVenueId
    ? await tx.$queryRaw<{ id: string; ownerUserId: string }[]>`
        SELECT "id", "ownerUserId"
        FROM "Venue"
        WHERE "documentType" = ${document.documentType}::"VenueDocumentType"
          AND "documentDigits" = ${document.documentDigits}
          AND "id" <> ${excludeVenueId}
        FOR UPDATE
      `
    : await tx.$queryRaw<{ id: string; ownerUserId: string }[]>`
        SELECT "id", "ownerUserId"
        FROM "Venue"
        WHERE "documentType" = ${document.documentType}::"VenueDocumentType"
          AND "documentDigits" = ${document.documentDigits}
        FOR UPDATE
      `;

  for (const row of rows) {
    if (row.ownerUserId !== ownerUserId) {
      throw new ConflictException(VENUE_DOCUMENT_TAKEN);
    }
  }
}
