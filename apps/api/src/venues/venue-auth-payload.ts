import { Prisma } from '@prisma/client';

export const ACTIVE_VENUE_HEADER = 'x-after-active-venue-id';

export const authUserVenueInclude = {
  ownedVenues: {
    where: { ownerArchivedAt: null },
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      logoUrl: true,
      createdAt: true,
    },
  },
} satisfies Prisma.UserInclude;

export type AuthUserVenueRow = {
  activeVenueId: string | null;
  ownedVenues: {
    id: string;
    name: string;
    city: string;
    state: string;
    logoUrl: string | null;
    createdAt?: Date;
  }[];
};

/** Stable legacy primary: oldest owned venue (createdAt asc). */
export function legacyPrimaryVenueId(
  venues: readonly { id: string }[] | undefined,
): string | null {
  return venues?.[0]?.id ?? null;
}

export function buildVenueAuthFields(user: AuthUserVenueRow) {
  const venues = (user.ownedVenues ?? []).map((venue) => ({
    id: venue.id,
    name: venue.name,
    city: venue.city,
    state: venue.state,
    logoUrl: venue.logoUrl,
  }));
  const primaryId = legacyPrimaryVenueId(user.ownedVenues ?? []);
  return {
    venueId: primaryId,
    activeVenueId: user.activeVenueId,
    venues,
  };
}

export function firstOwnedVenueId(user: {
  ownedVenues?: { id: string }[];
}): string | null {
  return legacyPrimaryVenueId(user.ownedVenues);
}
