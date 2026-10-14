import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CARD_PAID_RECONCILE_INTERVAL_MS,
  cardReconcileColumnsReady,
  cardRefundReconcileEnabled,
} from './card-refund.ledger';
import { CreditsService } from './credits.service';
import { sanitizeProviderError } from './providers/mercado-pago-orders';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CardRefundReconcileScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CardRefundReconcileScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly credits: CreditsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    if (!cardRefundReconcileEnabled()) {
      this.logger.log('Card refund reconciliation disabled');
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, CARD_PAID_RECONCILE_INTERVAL_MS);
    this.logger.log(
      `Card refund reconciliation scheduled intervalMs=${CARD_PAID_RECONCILE_INTERVAL_MS}`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (!cardRefundReconcileEnabled()) return;
    if (this.running) {
      this.logger.warn('Card refund reconciliation skipped overlap');
      return;
    }
    this.running = true;
    const started = Date.now();
    this.logger.log('Card refund reconciliation start');
    try {
      const ready = await cardReconcileColumnsReady(this.prisma);
      if (!ready) {
        this.logger.warn(
          `Card refund reconciliation skipped schema durationMs=${Date.now() - started}`,
        );
        return;
      }
      const result = await this.credits.reconcilePaidCardPurchases(new Date());
      this.logger.log(
        [
          'Card refund reconciliation finish',
          `checked=${result.checked}`,
          `refunded=${result.refunded}`,
          `partial=${result.partial}`,
          `errors=${result.errors}`,
          `timeouts=${result.timeouts}`,
          `rateLimited=${result.rateLimited}`,
          `leaseLost=${result.leaseLost}`,
          `skipped=${result.skipReason ?? 'no'}`,
          `durationMs=${Date.now() - started}`,
        ].join(' '),
      );
    } catch (error) {
      const text = sanitizeProviderError(
        error instanceof Error ? error.message : 'erro',
      )
        .replace(/\s+/g, ' ')
        .slice(0, 120);
      this.logger.error(
        `Card refund reconciliation failed durationMs=${Date.now() - started} ${text}`,
      );
    } finally {
      this.running = false;
    }
  }
}
