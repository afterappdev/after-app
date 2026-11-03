import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type VenueOwnerRow = { id: string; ownerUserId: string };

const activeOwnedVenueWhere = {
  ownerArchivedAt: null,
} satisfies Prisma.VenueWhereInput;

export async function findOwnedVenue(
  db: Prisma.TransactionClient | { venue: Prisma.VenueDelegate },
  userId: string,
  venueId: string,
): Promise<VenueOwnerRow> {
  const venue = await db.venue.findFirst({
    where: { id: venueId, ownerUserId: userId, ...activeOwnedVenueWhere },
    select: { id: true, ownerUserId: true },
  });
  if (!venue) {
    throw new ForbiddenException('Estabelecimento não encontrado ou sem permissão.');
  }
  return venue;
}

export async function assertVenueOwned(
  db: Prisma.TransactionClient | { venue: Prisma.VenueDelegate },
  userId: string,
  venueId: string,
): Promise<void> {
  await findOwnedVenue(db, userId, venueId);
}

/**
 * Resolves the venue for implicit routes (wallet, banners, …).
 * Explicit header wins. Legacy clients without header use the oldest owned venue
 * when several exist (stable, independent of mutable activeVenueId).
 */
export async function resolveOwnedVenueId(
  db: {
    venue: Prisma.VenueDelegate;
  },
  userId: string,
  requestedVenueId?: string | null,
): Promise<string> {
  const explicit = requestedVenueId?.trim();
  if (explicit) {
    await assertVenueOwned(db, userId, explicit);
    return explicit;
  }

  const owned = await db.venue.findMany({
    where: { ownerUserId: userId, ...activeOwnedVenueWhere },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });
  if (owned.length === 0) {
    throw new ForbiddenException('Conta não é de estabelecimento');
  }
  return owned[0].id;
}
