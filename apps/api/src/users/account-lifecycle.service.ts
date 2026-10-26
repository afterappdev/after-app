import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACCOUNT_DELETION_GRACE_EXPIRED_MESSAGE,
  ACCOUNT_DELETION_GRACE_MS,
  ACCOUNT_DELETION_NOT_PENDING_MESSAGE,
  ACCOUNT_PURGE_IN_PROGRESS_MESSAGE,
} from './account-recovery';
import { AccountPurgeAuditService } from './account-purge.audit';

export type DeletionStatusView = {
  accountStatus: AccountLifecycleStatus;
  deletionRequestedAt: Date | null;
  permanentDeletionAt: Date | null;
  remainingSeconds: number;
};

export type ScheduleDeletionResult = {
  deletionRequestedAt: Date;
  permanentDeletionAt: Date;
  remainingSeconds: number;
};

@Injectable()
export class AccountLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly purgeAudit?: AccountPurgeAuditService,
  ) {}

  buildDeletionStatus(user: {
    accountStatus: AccountLifecycleStatus;
    deletionRequestedAt: Date | null;
    permanentDeletionAt: Date | null;
  }): DeletionStatusView {
    const permanentDeletionAt = user.permanentDeletionAt;
    const remainingSeconds =
      user.accountStatus === AccountLifecycleStatus.PENDING_DELETION &&
      permanentDeletionAt
        ? Math.max(
            0,
            Math.floor((permanentDeletionAt.getTime() - Date.now()) / 1000),
          )
        : 0;
    return {
      accountStatus: user.accountStatus,
      deletionRequestedAt: user.deletionRequestedAt,
      permanentDeletionAt,
      remainingSeconds,
    };
  }

  async getDeletionStatus(userId: string): Promise<DeletionStatusView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountStatus: true,
        deletionRequestedAt: true,
        permanentDeletionAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return this.buildDeletionStatus(user);
  }

  async scheduleAccountDeletion(userId: string): Promise<ScheduleDeletionResult> {
    const result = await this.prisma.$transaction((tx) =>
      this.scheduleAccountDeletionTx(tx, userId),
    );
    this.purgeAudit?.log('deletion_requested', { userId });
    return result;
  }

  async scheduleAccountDeletionTx(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<ScheduleDeletionResult> {
    const now = new Date();

    {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          accountStatus: true,
          deletionRequestedAt: true,
          permanentDeletionAt: true,
          deletionConfirmedAt: true,
        },
      });
      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }
      if (user.role === Role.ADMIN) {
        throw new BadRequestException(
          'Conta administrativa não pode ser excluída por este fluxo.',
        );
      }

      const existingJob = await tx.accountPurgeJob.findUnique({
        where: { userId },
        select: { status: true },
      });
      if (existingJob?.status === AccountPurgeJobStatus.PROCESSING) {
        throw new ConflictException(ACCOUNT_PURGE_IN_PROGRESS_MESSAGE);
      }

      const alreadyPending =
        user.accountStatus === AccountLifecycleStatus.PENDING_DELETION &&
        user.deletionRequestedAt &&
        user.permanentDeletionAt;

      const deletionRequestedAt = alreadyPending
        ? user.deletionRequestedAt!
        : now;
      const permanentDeletionAt = alreadyPending
        ? user.permanentDeletionAt!
        : new Date(now.getTime() + ACCOUNT_DELETION_GRACE_MS);

      await tx.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          deletionRequestedAt,
          permanentDeletionAt,
          deletionConfirmedAt: alreadyPending
            ? user.deletionConfirmedAt ?? now
            : now,
          deletionCancelledAt: null,
          ...(alreadyPending
            ? {}
            : {
                sessionInvalidatedAt: now,
                sessionVersion: { increment: 1 },
              }),
        },
      });

      await this.upsertPurgeJob(tx, userId, permanentDeletionAt, existingJob);

      return {
        deletionRequestedAt,
        permanentDeletionAt,
        remainingSeconds: Math.max(
          0,
          Math.floor((permanentDeletionAt.getTime() - Date.now()) / 1000),
        ),
      };
    }
  }

  async cancelAccountDeletion(userId: string): Promise<{ ok: true }> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          accountStatus: true,
          permanentDeletionAt: true,
        },
      });
      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }
      if (user.accountStatus !== AccountLifecycleStatus.PENDING_DELETION) {
        throw new BadRequestException(ACCOUNT_DELETION_NOT_PENDING_MESSAGE);
      }
      if (
        !user.permanentDeletionAt ||
        user.permanentDeletionAt.getTime() <= now.getTime()
      ) {
        throw new BadRequestException(ACCOUNT_DELETION_GRACE_EXPIRED_MESSAGE);
      }

      const job = await tx.accountPurgeJob.findUnique({
        where: { userId },
        select: { status: true },
      });
      if (job?.status === AccountPurgeJobStatus.PROCESSING) {
        throw new ConflictException(ACCOUNT_PURGE_IN_PROGRESS_MESSAGE);
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountLifecycleStatus.ACTIVE,
          deletionCancelledAt: now,
          deletionRequestedAt: null,
          permanentDeletionAt: null,
          deletionConfirmedAt: null,
          sessionInvalidatedAt: now,
          sessionVersion: { increment: 1 },
        },
      });

      if (job) {
        await tx.accountPurgeJob.update({
          where: { userId },
          data: {
            status: AccountPurgeJobStatus.CANCELLED,
            cancelledAt: now,
            lastError: null,
          },
        });
      }

      return { ok: true as const };
    }).then((result) => {
      this.purgeAudit?.log('deletion_cancelled', { userId });
      return result;
    });
  }

  private async upsertPurgeJob(
    tx: Prisma.TransactionClient,
    userId: string,
    scheduledFor: Date,
    existing: { status: AccountPurgeJobStatus } | null,
  ) {
    if (!existing) {
      await tx.accountPurgeJob.create({
        data: {
          userId,
          scheduledFor,
          status: AccountPurgeJobStatus.PENDING,
        },
      });
      return;
    }

    if (existing.status === AccountPurgeJobStatus.CANCELLED) {
      await tx.accountPurgeJob.update({
        where: { userId },
        data: {
          scheduledFor,
          status: AccountPurgeJobStatus.PENDING,
          attempts: 0,
          lastError: null,
          completedAt: null,
          cancelledAt: null,
        },
      });
      return;
    }

    if (
      existing.status === AccountPurgeJobStatus.PENDING ||
      existing.status === AccountPurgeJobStatus.FAILED
    ) {
      await tx.accountPurgeJob.update({
        where: { userId },
        data: { scheduledFor },
      });
    }
  }
}
