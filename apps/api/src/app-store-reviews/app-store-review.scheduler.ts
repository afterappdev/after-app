import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  APP_STORE_REVIEW_LOCK_MS,
  appStoreReviewEnabled,
  appStoreReviewPollMs,
  type AppStoreReviewEnv,
} from './app-store-review.config';
import { AppStoreReviewStore, isMissingAppStoreReviewSchema } from './app-store-review.store';
import { AppStoreReviewSyncService } from './app-store-review-sync.service';

@Injectable()
export class AppStoreReviewScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppStoreReviewScheduler.name);
  private readonly workerId = `asc-reviews-${process.pid}-${randomUUID()}`;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private schemaMissing = false;
  private env: AppStoreReviewEnv = process.env;

  constructor(
    private readonly store: AppStoreReviewStore,
    private readonly sync: AppStoreReviewSyncService,
  ) {}

  useEnv(env: AppStoreReviewEnv): this {
    this.env = env;
    this.sync.useEnv(env);
    return this;
  }

  onModuleInit(): void {
    if (!appStoreReviewEnabled(this.env)) {
      this.logger.log(
        'App Store review e-mail scheduler disabled (APP_STORE_REVIEW_EMAIL_ENABLED=false ou NODE_ENV=test)',
      );
      return;
    }
    const pollMs = appStoreReviewPollMs(this.env);
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, pollMs);
    this.logger.log(
      `App Store review scheduler started intervalMs=${pollMs} workerId=${this.workerId}`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = new Date()): Promise<void> {
    if (!appStoreReviewEnabled(this.env) || this.schemaMissing) return;
    if (this.running) {
      this.logger.warn('app-store-reviews tick skipped overlap');
      return;
    }
    this.running = true;
    let acquired = false;
    const started = Date.now();
    try {
      acquired = await this.store.acquireLock(
        this.workerId,
        now,
        APP_STORE_REVIEW_LOCK_MS,
      );
      if (!acquired) return;
      await this.sync.runTick(now);
    } catch (error) {
      if (isMissingAppStoreReviewSchema(error)) {
        this.schemaMissing = true;
        this.logger.warn(
          'app-store-reviews schema ausente; agendamento desligado até migrate deploy',
        );
        return;
      }
      const text =
        error instanceof Error
          ? error.message.replace(/\s+/g, ' ').slice(0, 160)
          : 'tick_failed';
      this.logger.error(
        `app-store-reviews tick failed durationMs=${Date.now() - started} ${text}`,
      );
    } finally {
      if (acquired) {
        try {
          await this.store.releaseLock(this.workerId, new Date());
        } catch {
          /* lock lease expires */
        }
      }
      this.running = false;
    }
  }
}