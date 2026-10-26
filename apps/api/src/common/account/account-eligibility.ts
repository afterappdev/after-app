import { ForbiddenException } from '@nestjs/common';
import {
  AccountLifecycleStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const ACCOUNT_PENDING_OPERATION_MESSAGE =
  'Conta indisponível durante o período de exclusão. Use o fluxo de recuperação se deseja cancelar a exclusão.';

type Db = PrismaService | Prisma.TransactionClient;

export async function assertUserAccountActive(
  db: Db,
  userId: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { accountStatus: true },
  });
  if (
    !user ||
    user.accountStatus === AccountLifecycleStatus.PENDING_DELETION ||
    user.accountStatus === AccountLifecycleStatus.PURGED
  ) {
    throw new ForbiddenException(ACCOUNT_PENDING_OPERATION_MESSAGE);
  }
}
