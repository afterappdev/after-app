import { Injectable } from '@nestjs/common';
import {
  AccountLifecycleStatus,
  AccountPurgeJobStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PURGE_PROGRESS,
  purgeStageAtLeast,
  type PurgeProgressStage,
} from './account-purge.progress';
import { PURGE_CLAIMABLE_STATUSES } from './account-purge.states';

export type ClaimedPurgeJob = {
  id: string;
  userId: string;
  status: AccountPurgeJobStatus;
  attempts: number;
  scheduledFor: Date;
  leaseEpoch: number;
};

function claimableWhere(now: Date): Prisma.AccountPurgeJobWhereInput {
  return {
    OR: [
      {
        status: { in: PURGE_CLAIMABLE_STATUSES },
        scheduledFor: { lte: now },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      {
        status: AccountPurgeJobStatus.PROCESSING,
        lockedUntil: { lt: now },
      },
    ],
  };
}

function processingWhere(
  jobId: string,
  workerId: string,
  leaseEpoch: number,
): Prisma.AccountPurgeJobWhereInput {
  return {
    id: jobId,
    lockedBy: workerId,
    status: AccountPurgeJobStatus.PROCESSING,
    leaseEpoch,
  };
}

@Injectable()
export class AccountPurgeStore {
  constructor(private readonly prisma: PrismaService) {}

  async listEligibleJobIds(now: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.accountPurgeJob.findMany({
      where: claimableWhere(now),
      select: { id: true },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });
    return rows.map((row) => row.id);
  }

  /**
   * Atomically reserves a job and revalidates account eligibility in the same transaction.
   */
  async tryClaimJob(
    jobId: string,
    workerId: string,
    now: Date,
    leaseMs: number,
  ): Promise<ClaimedPurgeJob | null> {
    return this.prisma.$transaction(async (tx) => {
      const lockedUntil = new Date(now.getTime() + leaseMs);
      const claimed = await tx.accountPurgeJob.updateMany({
        where: { id: jobId, ...claimableWhere(now) },
        data: {
          status: AccountPurgeJobStatus.PROCESSING,
          lockedUntil,
          lockedBy: workerId,
          attempts: { increment: 1 },
          leaseEpoch: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        return null;
      }

      const job = await tx.accountPurgeJob.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          userId: true,
          status: true,
          attempts: true,
          scheduledFor: true,
          leaseEpoch: true,
          progressStage: true,
        },
      });
      if (!job) {
        return null;
      }

      const user = await tx.user.findUnique({
        where: { id: job.userId },
        select: {
          accountStatus: true,
          permanentDeletionAt: true,
          role: true,
        },
      });

      const resumePastData = purgeStageAtLeast(
        job.progressStage as PurgeProgressStage | null,
        PURGE_PROGRESS.DATA,
      );

      const pendingEligible =
        user != null &&
        user.role !== 'ADMIN' &&
        user.accountStatus === AccountLifecycleStatus.PENDING_DELETION &&
        user.permanentDeletionAt != null &&
        user.permanentDeletionAt.getTime() <= now.getTime();

      const purgedResume =
        user != null &&
        user.accountStatus === AccountLifecycleStatus.PURGED &&
        resumePastData;

      const orphanResume = user == null && resumePastData;

      const eligible = pendingEligible || purgedResume || orphanResume;

      if (!eligible) {
        if (user?.accountStatus === AccountLifecycleStatus.ACTIVE) {
          await tx.accountPurgeJob.update({
            where: { id: jobId },
            data: {
              status: AccountPurgeJobStatus.CANCELLED,
              lockedUntil: null,
              lockedBy: null,
              cancelledAt: now,
              lastError: null,
            },
          });
        } else {
          const releaseStatus =
            job.status === AccountPurgeJobStatus.FAILED
              ? AccountPurgeJobStatus.FAILED
              : AccountPurgeJobStatus.PENDING;
          await tx.accountPurgeJob.update({
            where: { id: jobId },
            data: {
              status: releaseStatus,
              lockedUntil: null,
              lockedBy: null,
            },
          });
        }
        return null;
      }

      return job;
    });
  }

  async releaseAfterSimulation(
    jobId: string,
    workerId: string,
    leaseEpoch: number,
    cooldownUntil: Date,
  ): Promise<void> {
    await this.prisma.accountPurgeJob.updateMany({
      where: processingWhere(jobId, workerId, leaseEpoch),
      data: {
        status: AccountPurgeJobStatus.PENDING,
        lockedUntil: cooldownUntil,
        lockedBy: null,
      },
    });
  }

  async renewLease(
    jobId: string,
    workerId: string,
    leaseEpoch: number,
    now: Date,
    leaseMs: number,
  ): Promise<boolean> {
    const updated = await this.prisma.accountPurgeJob.updateMany({
      where: processingWhere(jobId, workerId, leaseEpoch),
      data: {
        lockedUntil: new Date(now.getTime() + leaseMs),
      },
    });
    return updated.count === 1;
  }

  async assertLeaseHeld(
    jobId: string,
    workerId: string,
    leaseEpoch: number,
  ): Promise<boolean> {
    const row = await this.prisma.accountPurgeJob.findFirst({
      where: processingWhere(jobId, workerId, leaseEpoch),
      select: { id: true },
    });
    return row != null;
  }

  async loadProcessingJob(
    jobId: string,
    workerId: string,
    leaseEpoch: number,
  ) {
    return this.prisma.accountPurgeJob.findFirst({
      where: processingWhere(jobId, workerId, leaseEpoch),
      select: {
        id: true,
        userId: true,
        progressStage: true,
        uploadManifest: true,
        attempts: true,
        leaseEpoch: true,
      },
    });
  }

  async saveProgress(
    jobId: string,
    workerId: string,
    leaseEpoch: number,
    stage: PurgeProgressStage,
    uploadManifest?: string[],
  ): Promise<boolean> {
    const updated = await this.prisma.accountPurgeJob.updateMany({
      where: processingWhere(jobId, workerId, leaseEpoch),
      data: {
        progressStage: stage,
        ...(uploadManifest != null
          ? { uploadManifest: uploadManifest as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    return updated.count === 1;
  }

  async markCompleted(
    jobId: string,
    workerId: string,
    leaseEpoch: number,
    now: Date,
  ): Promise<boolean> {
    const updated = await this.prisma.accountPurgeJob.updateMany({
      where: {
        ...processingWhere(jobId, workerId, leaseEpoch),
        progressStage: PURGE_PROGRESS.DONE,
      },
      data: {
        status: AccountPurgeJobStatus.COMPLETED,
        lockedUntil: null,
        lockedBy: null,
        completedAt: now,
        lastError: null,
      },
    });
    return updated.count === 1;
  }

  async markFailed(
    jobId: string,
    workerId: string,
    leaseEpoch: number,
    errorSummary: string,
    now: Date,
  ): Promise<boolean> {
    const trimmed = errorSummary.replace(/\s+/g, ' ').trim().slice(0, 500);
    const updated = await this.prisma.accountPurgeJob.updateMany({
      where: processingWhere(jobId, workerId, leaseEpoch),
      data: {
        status: AccountPurgeJobStatus.FAILED,
        lockedUntil: null,
        lockedBy: null,
        lastError: trimmed || 'processing_failed',
        updatedAt: now,
      },
    });
    return updated.count === 1;
  }
}
