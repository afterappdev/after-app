import { AccountLifecycleStatus } from '@prisma/client';

/** Prisma mock helper for services that call assertUserAccountActive. */
export function mockActiveUserPrisma(
  prisma: Record<string, unknown>,
): void {
  prisma.user = {
    findUnique: jest.fn(async () => ({
      accountStatus: AccountLifecycleStatus.ACTIVE,
    })),
  };
}
