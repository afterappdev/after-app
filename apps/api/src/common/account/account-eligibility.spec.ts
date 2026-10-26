import { AccountLifecycleStatus } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { assertUserAccountActive } from './account-eligibility';

describe('assertUserAccountActive', () => {
  it('permite conta ACTIVE', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          accountStatus: AccountLifecycleStatus.ACTIVE,
        }),
      },
    };
    await expect(
      assertUserAccountActive(prisma as never, 'u1'),
    ).resolves.toBeUndefined();
  });

  it('bloqueia conta PENDING_DELETION', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
        }),
      },
    };
    await expect(
      assertUserAccountActive(prisma as never, 'u1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
