import { AccountLifecycleStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

export async function blockedVenueIdsForUser(
  prisma: PrismaService,
  user?: AuthUser | null,
): Promise<string[]> {
  if (!user?.userId || user.role !== 'USER') {
    return [];
  }
  const rows = await prisma.userVenueBlock.findMany({
    where: { userId: user.userId },
    select: { venueId: true },
  });
  return rows.map((row) => row.venueId);
}

/** Shared public visibility: not moderated and owner account is ACTIVE. */
export function publicVenueWhere(
  blockedIds: string[] = [],
): Prisma.VenueWhereInput {
  const where: Prisma.VenueWhereInput = {
    moderationHiddenAt: null,
    owner: { accountStatus: AccountLifecycleStatus.ACTIVE },
  };
  if (blockedIds.length > 0) {
    where.id = { notIn: blockedIds };
  }
  return where;
}

export function isVenuePubliclyVisible(venue: {
  moderationHiddenAt: Date | null;
  owner: { accountStatus: AccountLifecycleStatus };
}): boolean {
  return (
    venue.moderationHiddenAt == null &&
    venue.owner.accountStatus === AccountLifecycleStatus.ACTIVE
  );
}

/** Nested filter for notification inbox and similar venue joins. */
export function publicVenueRelationWhere(
  blockedIds: string[] = [],
): Prisma.VenueWhereInput {
  return publicVenueWhere(blockedIds);
}
