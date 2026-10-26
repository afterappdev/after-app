import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  accountPurgeBatchSize,
  accountPurgeDestructiveAllowed,
  accountPurgeDryRun,
  accountPurgeEnabled,
  accountPurgeLeaseMs,
  accountPurgePollMs,
  type AccountPurgeEnv,
} from './account-purge.config';
import {
  ACCOUNT_PURGE_EXECUTOR,
  type AccountPermanentPurgeExecutor,
} from './account-purge.executor';
import { AccountPurgeAuditService } from './account-purge.audit';
import { FinancialPurgeBlockedError } from './account-purge.financial';
import { PurgeLeaseLostError } from './account-purge.executor.impl';
import { UploadPurgeIncompleteError } from './account-purge.upload';
import { AccountPurgeStore } from './account-purge.store';

export type AccountPurgeTickResult = {
  eligible: number;
  claimed: number;
  simulated: number;
  failed: number;
  skipped: number;
};

@Injectable()
export class AccountPurgeService {
  private readonly logger = new Logger(AccountPurgeService.name);
  private env: AccountPurgeEnv = process.env;

  constructor(
    private readonly store: AccountPurgeStore,
    @Inject(ACCOUNT_PURGE_EXECUTOR)
    private readonly executor: AccountPermanentPurgeExecutor,
    private readonly purgeAudit: AccountPurgeAuditService,
  ) {}

  useEnv(env: AccountPurgeEnv): this {
    this.env = env;
    return this;
  }

  isEnabled(): boolean {
    return accountPurgeEnabled(this.env);
  }

  async runTick(now = new Date(), workerId: string): Promise<AccountPurgeTickResult> {
    const result: AccountPurgeTickResult = {
      eligible: 0,
      claimed: 0,
      simulated: 0,
      failed: 0,
      skipped: 0,
    };

    if (!accountPurgeEnabled(this.env)) {
      return result;
    }

    const batch = accountPurgeBatchSize(this.env);
    const leaseMs = accountPurgeLeaseMs(this.env);
    const dryRun = accountPurgeDryRun(this.env);
    const cooldownMs = accountPurgePollMs(this.env);

    const ids = await this.store.listEligibleJobIds(now, batch);
    result.eligible = ids.length;

    for (const jobId of ids) {
      const started = Date.now();
      const job = await this.store.tryClaimJob(jobId, workerId, now, leaseMs);
      if (!job) {
        result.skipped += 1;
        continue;
      }
      result.claimed += 1;
      if (job.attempts > 1) {
        this.purgeAudit.log('job_resumed', {
          userId: job.userId,
          jobId: job.id,
          attempts: job.attempts,
        });
      }

      try {
        if (!accountPurgeDestructiveAllowed(this.env) || dryRun) {
          const durationMs = Date.now() - started;
          this.logger.log(
            [
              'account-purge simulated',
              `jobId=${job.id}`,
              `userId=${job.userId}`,
              `status=${job.status}`,
              `attempts=${job.attempts}`,
              `durationMs=${durationMs}`,
              'result=simulated',
            ].join(' '),
          );
          await this.store.releaseAfterSimulation(
            job.id,
            workerId,
            job.leaseEpoch,
            new Date(now.getTime() + cooldownMs),
          );
          result.simulated += 1;
          continue;
        }

        await this.executor.executePermanentPurge(job.userId, {
          jobId: job.id,
          workerId,
          leaseEpoch: job.leaseEpoch,
          renewLease: () =>
            this.store.renewLease(
              job.id,
              workerId,
              job.leaseEpoch,
              new Date(),
              leaseMs,
            ),
        });
        const leaseHeld = await this.store.assertLeaseHeld(
          job.id,
          workerId,
          job.leaseEpoch,
        );
        if (!leaseHeld) {
          throw new PurgeLeaseLostError();
        }
        const completed = await this.store.markCompleted(
          job.id,
          workerId,
          job.leaseEpoch,
          new Date(),
        );
        if (!completed) {
          throw new PurgeLeaseLostError();
        }
        this.purgeAudit.log('job_completed', {
          userId: job.userId,
          jobId: job.id,
        });
      } catch (error) {
        const durationMs = Date.now() - started;
        const message =
          error instanceof Error ? error.message : 'processing_failed';
        if (error instanceof FinancialPurgeBlockedError) {
          this.purgeAudit.log('job_blocked', {
            userId: job.userId,
            jobId: job.id,
            reasons: error.reasons.join(','),
          });
        } else if (
          error instanceof PurgeLeaseLostError ||
          error instanceof UploadPurgeIncompleteError
        ) {
          this.purgeAudit.log('job_failed', {
            userId: job.userId,
            jobId: job.id,
            error: message.slice(0, 120),
          });
        }
        this.logger.warn(
          [
            'account-purge failed',
            `jobId=${job.id}`,
            `userId=${job.userId}`,
            `status=FAILED`,
            `attempts=${job.attempts}`,
            `durationMs=${durationMs}`,
            `result=error`,
            `error=${message.replace(/\s+/g, ' ').slice(0, 120)}`,
          ].join(' '),
        );
        await this.store.markFailed(
          job.id,
          workerId,
          job.leaseEpoch,
          message,
          now,
        );
        result.failed += 1;
      }
    }

    return result;
  }
}
