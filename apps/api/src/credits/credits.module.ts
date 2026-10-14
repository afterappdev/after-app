import { Module } from '@nestjs/common';
import { CreditsController } from './credits.controller';
import { CreditsWebhooksController } from './credits-webhooks.controller';
import { CardRefundReconcileScheduler } from './card-refund-reconcile.scheduler';
import { CreditsService } from './credits.service';
import { AppleAppStorePaymentProvider } from './providers/apple-app-store.provider';
import { GooglePlayPaymentProvider } from './providers/google-play.provider';
import { PaymentProviderRegistry } from './providers/payment-providers';
import { MercadoPagoOrdersClient } from './providers/mercado-pago-orders';
import { CardPaymentProvider } from './providers/card.provider';
import { PixPaymentProvider } from './providers/pix.provider';
import { AdminPushModule } from '../admin/push/admin-push.module';

@Module({
  imports: [AdminPushModule],
  controllers: [CreditsController, CreditsWebhooksController],
  providers: [
    CreditsService,
    CardRefundReconcileScheduler,
    GooglePlayPaymentProvider,
    AppleAppStorePaymentProvider,
    MercadoPagoOrdersClient,
    PixPaymentProvider,
    CardPaymentProvider,
    PaymentProviderRegistry,
  ],
  exports: [CreditsService],
})
export class CreditsModule {}
