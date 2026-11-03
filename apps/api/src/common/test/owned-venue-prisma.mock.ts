import { mockActiveUserPrisma } from '../account/mock-active-user-prisma';

export type OwnedVenuePrismaMock = {
  id: string;
  ownerUserId: string;
  name?: string;
  city?: string;
  state?: string;
  ibgeCityId?: number | null;
  logoUrl?: string | null;
  owner?: { email: string; name: string };
};

/** Extends a Prisma mock with user account status + multi-venue delegates. */
export function mockOwnedVenuePrisma(
  prisma: Record<string, unknown>,
  venue: OwnedVenuePrismaMock,
): void {
  mockActiveUserPrisma(prisma);
  const resolved = {
    name: 'Bar',
    city: 'São Paulo',
    state: 'SP',
    ibgeCityId: null as number | null,
    logoUrl: null as string | null,
    ...venue,
    owner: venue.owner ?? { email: 'owner@test.com', name: 'Owner' },
  };
  const existing = prisma.venue as Record<string, jest.Mock> | undefined;
  const findUnique = jest.fn().mockResolvedValue(resolved);
  const findMany = jest.fn().mockImplementation(async () => {
    const row = await findUnique();
    if (!row || typeof row !== 'object' || !('id' in row)) {
      return [];
    }
    return [{ id: String((row as { id: string }).id), createdAt: new Date(0) }];
  });
  const findFirst = jest.fn().mockImplementation(async (args?: {
    where?: { id?: string; ownerUserId?: string };
  }) => {
    const row = await findUnique();
    if (!row || typeof row !== 'object') return null;
    const id = (row as { id: string }).id;
    const ownerUserId = (row as { ownerUserId: string }).ownerUserId;
    const where = args?.where;
    if (where?.id && where.id !== id) return null;
    if (where?.ownerUserId && where.ownerUserId !== ownerUserId) return null;
    return { id, ownerUserId };
  });
  prisma.venue = {
    ...(existing ?? {}),
    findUnique,
    findMany,
    findFirst,
    update: existing?.update ?? jest.fn(),
  };
}
