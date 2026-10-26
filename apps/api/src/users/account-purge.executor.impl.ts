import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AccountLifecycleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MediaCleanupService } from '../uploads/media-cleanup.service';
import { AccountPurgeAuditService } from './account-purge.audit';
import { FinancialPurgeBlockedError } from './account-purge.financial';
import { UploadPurgeIncompleteError } from './account-purge.upload';
import {
  PURGE_PROGRESS,
  purgeStageAtLeast,
  type PurgeProgressStage,
} from './account-purge.progress';
import { AccountPurgeStore } from './account-purge.store';
import type {
  AccountPermanentPurgeExecutor,
  PermanentPurgeRunContext,
} from './account-purge.executor';
import { UsersService } from './users.service';

export class PurgeLeaseLostError extends Error {
  constructor() {
    super('purge_lease_lost');
    this.name = 'PurgeLeaseLostError';
  }
}

function manifestFromJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

@Injectable()
export class AccountPermanentPurgeExecutorImpl
  implements AccountPermanentPurgeExecutor
{
  private readonly logger = new Logger(AccountPermanentPurgeExecutorImpl.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly mediaCleanup: MediaCleanupService,
    private readonly store: AccountPurgeStore,
    private readonly purgeAudit: AccountPurgeAuditService,
  ) {}

  async executePermanentPurge(
    userId: string,
    ctx: PermanentPurgeRunContext,
  ): Promise<void> {
    const job = await this.store.loadProcessingJob(
      ctx.jobId,
      ctx.workerId,
      ctx.leaseEpoch,
    );
    if (!job || job.userId !== userId) {
      throw new PurgeLeaseLostError();
    }

    let stage = (job.progressStage as PurgeProgressStage | null) ?? null;

    if (!purgeStageAtLeast(stage, PURGE_PROGRESS.ELIGIBILITY)) {
      this.purgeAudit.log('job_started', {
        userId,
        jobId: ctx.jobId,
        workerId: ctx.workerId,
      });
      await this.assertLease(ctx);
      await this.revalidateEligibility(userId, stage);
      stage = PURGE_PROGRESS.ELIGIBILITY;
      await this.persistProgress(ctx, stage);
    }

    if (!purgeStageAtLeast(stage, PURGE_PROGRESS.FINANCIAL)) {
      await this.assertLease(ctx);
      const blockers = await this.users.listFinancialPurgeBlockersForUser(userId);
      if (blockers.length > 0) {
        this.purgeAudit.log('job_blocked', {
          userId,
          jobId: ctx.jobId,
          reasons: blockers.join(','),
        });
        throw new FinancialPurgeBlockedError(blockers);
      }
      await this.users.anonymizeFinancialRetention(userId);
      this.purgeAudit.log('data_anonymized', {
        userId,
        jobId: ctx.jobId,
        source: 'scheduler',
      });
      stage = PURGE_PROGRESS.FINANCIAL;
      await this.persistProgress(ctx, stage);
    }

    let manifest = manifestFromJson(job.uploadManifest);
    if (!purgeStageAtLeast(stage, PURGE_PROGRESS.MANIFEST)) {
      await this.assertLease(ctx);
      const subject = await this.users.loadUserForPermanentPurge(userId);
      if (!subject) {
        throw new NotFoundException('Usuário não encontrado');
      }
      manifest = this.users.collectUploadUrlsFromUser(subject);
      stage = PURGE_PROGRESS.MANIFEST;
      await this.persistProgress(ctx, stage, manifest);
    }

    if (!purgeStageAtLeast(stage, PURGE_PROGRESS.DATA)) {
      await this.assertLease(ctx);
      await this.users.revokeOAuthBeforePermanentRemoval(userId);
      const outcome = await this.users.finalizePermanentUserRemoval(userId);
      this.logger.log(
        `account-purge data phase userId=${userId} outcome=${outcome}`,
      );
      stage = PURGE_PROGRESS.DATA;
      await this.persistProgress(ctx, stage, manifest);
    }

    if (!purgeStageAtLeast(stage, PURGE_PROGRESS.UPLOADS)) {
      await this.assertLease(ctx);
      const renewed = await ctx.renewLease();
      if (!renewed) {
        throw new PurgeLeaseLostError();
      }
      const report =
        await this.mediaCleanup.deleteStoredUploadsWithReport(manifest);
      if (report.failedUrls.length > 0) {
        this.purgeAudit.log('uploads_partial_failure', {
          userId,
          jobId: ctx.jobId,
          failedCount: report.failedUrls.length,
        });
        throw new UploadPurgeIncompleteError(report.failedUrls);
      }
      this.purgeAudit.log('uploads_removed', {
        userId,
        jobId: ctx.jobId,
        removed: report.removed,
      });
      stage = PURGE_PROGRESS.UPLOADS;
      await this.persistProgress(ctx, stage, manifest);
    }

    if (!purgeStageAtLeast(stage, PURGE_PROGRESS.DONE)) {
      await this.assertLease(ctx);
      stage = PURGE_PROGRESS.DONE;
      await this.persistProgress(ctx, stage, manifest);
    }
  }

  private async persistProgress(
    ctx: PermanentPurgeRunContext,
    stage: PurgeProgressStage,
    uploadManifest?: string[],
  ): Promise<void> {
    const saved = await this.store.saveProgress(
      ctx.jobId,
      ctx.workerId,
      ctx.leaseEpoch,
      stage,
      uploadManifest,
    );
    if (!saved) {
      throw new PurgeLeaseLostError();
    }
  }

  private async revalidateEligibility(
    userId: string,
    resumeStage: PurgeProgressStage | null = null,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        accountStatus: true,
        permanentDeletionAt: true,
      },
    });
    if (!user) {
      if (purgeStageAtLeast(resumeStage, PURGE_PROGRESS.DATA)) {
        return;
      }
      throw new NotFoundException('Usuário não encontrado');
    }
    if (user.role === 'ADMIN') {
      throw new BadRequestException('admin_account');
    }
    const now = Date.now();
    if (user.accountStatus === AccountLifecycleStatus.ACTIVE) {
      throw new BadRequestException('account_recovered');
    }
    if (user.accountStatus === AccountLifecycleStatus.PURGED) {
      return;
    }
    if (user.accountStatus !== AccountLifecycleStatus.PENDING_DELETION) {
      throw new BadRequestException('account_not_pending_deletion');
    }
    if (
      !user.permanentDeletionAt ||
      user.permanentDeletionAt.getTime() > now
    ) {
      throw new BadRequestException('grace_period_active');
    }
  }

  private async assertLease(ctx: PermanentPurgeRunContext): Promise<void> {
    const held = await this.store.assertLeaseHeld(
      ctx.jobId,
      ctx.workerId,
      ctx.leaseEpoch,
    );
    if (!held) {
      throw new PurgeLeaseLostError();
    }
  }
}
