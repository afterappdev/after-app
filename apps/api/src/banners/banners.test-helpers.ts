import { AccountLifecycleStatus } from '@prisma/client';

/** Active venue owner — matches assertUserAccountActive in unit tests. */
export function mockActiveUserPrisma(
  prisma: Record<string, unknown>,
): void {
  prisma.user = {
    findUnique: jest.fn(async () => ({
      accountStatus: AccountLifecycleStatus.ACTIVE,
    })),
  };
}
