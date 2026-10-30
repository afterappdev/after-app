import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveOwnedVenueId } from './venue-ownership';

export type OwnedVenueWithOwner = Prisma.VenueGetPayload<{
  include: { owner: { select: { email: true; name: true } } };
}>;

type VenueDb = {
  venue: Prisma.VenueDelegate;
};

export async function loadOwnedVenueContext(
  db: VenueDb,
  userId: string,
  requestedVenueId?: string | null,
): Promise<OwnedVenueWithOwner> {
  const venueId = await resolveOwnedVenueId(db, userId, requestedVenueId);
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    include: { owner: { select: { email: true, name: true } } },
  });
  if (!venue) {
    throw new ForbiddenException('Conta não é de estabelecimento');
  }
  return venue;
}
