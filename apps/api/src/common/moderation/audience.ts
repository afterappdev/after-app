import { Prisma } from '@prisma/client';
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

export function publicVenueWhere(
  blockedIds: string[] = [],
): Prisma.VenueWhereInput {
  const where: Prisma.VenueWhereInput = { moderationHiddenAt: null };
  if (blockedIds.length > 0) {
    where.id = { notIn: blockedIds };
  }
  return where;
}
