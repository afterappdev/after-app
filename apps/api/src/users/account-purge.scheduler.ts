import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  accountPurgeEnabled,
  accountPurgePollMs,
  type AccountPurgeEnv,
} from './account-purge.config';
import { AccountPurgeService } from './account-purge.service';

@Injectable()
export class AccountPurgeScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountPurgeScheduler.name);
  private readonly workerId = `purge-${process.pid}-${randomUUID()}`;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private env: AccountPurgeEnv = process.env;

  constructor(private readonly purge: AccountPurgeService) {}

  useEnv(env: AccountPurgeEnv): this {
    this.env = env;
    this.purge.useEnv(env);
    return this;
  }

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') {
      return;
    }
    if (!accountPurgeEnabled(this.env)) {
      this.logger.log('Account purge scheduler disabled (ACCOUNT_PURGE_ENABLED=false)');
      return;
    }
    const intervalMs = accountPurgePollMs(this.env);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.logger.log(
      `Account purge scheduler started intervalMs=${intervalMs} workerId=${this.workerId}`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = new Date()): Promise<void> {
    if (!accountPurgeEnabled(this.env)) {
      return;
    }
    if (this.running) {
      this.logger.warn('Account purge tick skipped overlap');
      return;
    }
    this.running = true;
    const started = Date.now();
    try {
      const result = await this.purge.runTick(now, this.workerId);
      this.logger.log(
        [
          'account-purge tick',
          `eligible=${result.eligible}`,
          `claimed=${result.claimed}`,
          `simulated=${result.simulated}`,
          `failed=${result.failed}`,
          `skipped=${result.skipped}`,
          `durationMs=${Date.now() - started}`,
        ].join(' '),
      );
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message.replace(/\s+/g, ' ').slice(0, 120)
          : 'tick_failed';
      this.logger.error(
        `Account purge tick failed durationMs=${Date.now() - started} ${text}`,
      );
    } finally {
      this.running = false;
    }
  }
}
