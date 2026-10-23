import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { resolvePromoPushMode } from './promo-push.config';
import {
  PROMO_PUSH_LOCK_MS,
  PROMO_PUSH_POLL_MS,
} from './promo-push.retry';
import {
  isMissingPromoPushSchema,
  PROMO_PUSH_STORE,
  type PromoPushStore,
} from './promo-push.store';
import { PromoPushWorker } from './promo-push.worker';

@Injectable()
export class PromoPushScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PromoPushScheduler.name);
  private readonly workerId = `promo-${process.pid}-${randomUUID()}`;
  private timer: ReturnType<typeof setInterval> | null = null;
  private schemaMissing = false;

  private env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PROMO_PUSH_ENABLED: 'false',
  };

  constructor(
    @Inject(PROMO_PUSH_STORE) private readonly store: PromoPushStore,
    private readonly worker: PromoPushWorker,
  ) {}

  useEnv(env: NodeJS.ProcessEnv): this {
    this.env = env;
    return this;
  }

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, PROMO_PUSH_POLL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * The interval only wakes the process. Due work, the lease and the expiry
   * live in the database, so a restart or a second instance continues from there.
   */
  async tick(now = new Date()): Promise<void> {
    if (this.schemaMissing) return;
    let acquired = false;
    try {
      acquired = await this.store.acquireLock(
        this.workerId,
        now,
        PROMO_PUSH_LOCK_MS,
      );
      if (!acquired) return;
      await this.store.expireOverdue(now);
      const mode = resolvePromoPushMode(this.env);
      if (mode.kind === 'off') return;
      await this.worker.dispatchDue(now, mode);
    } catch (error) {
      if (isMissingPromoPushSchema(error)) {
        this.schemaMissing = true;
        this.logger.warn(
          'promo-push schema ausente; disparo promocional desligado',
        );
        return;
      }
      this.logger.error('promo-push tick failed');
    } finally {
      if (acquired) {
        try {
          await this.store.releaseLock(this.workerId, new Date());
        } catch {
          this.logger.error('promo-push lock release failed');
        }
      }
    }
  }
}
