import { Module } from '@nestjs/common';
import {
  FIREBASE_MESSAGING_PORT,
  type FirebaseMessagingPort,
} from '../admin/push/firebase-messaging.port';
import { LocationsModule } from '../locations/locations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FcmModule } from '../push/fcm.module';
import { PromoPushAccountService } from './promo-push.account';
import { PromoPushController } from './promo-push.controller';
import {
  PROMO_PUSH_PUBLISHER,
  PromoPushPublisherService,
} from './promo-push.publisher';
import { PromoPushScheduler } from './promo-push.scheduler';
import { PrismaPromoPushStore, PROMO_PUSH_STORE } from './promo-push.store';
import { PROMO_PUSH_INBOX } from './promo-push.inbox-port';
import { PromoPushWorker } from './promo-push.worker';
import { NotificationsService } from '../notifications/notifications.service';

@Module({
  imports: [LocationsModule, FcmModule, NotificationsModule],
  controllers: [PromoPushController],
  providers: [
    PromoPushAccountService,
    PromoPushPublisherService,
    {
      provide: PROMO_PUSH_PUBLISHER,
      useExisting: PromoPushPublisherService,
    },
    PrismaPromoPushStore,
    { provide: PROMO_PUSH_STORE, useExisting: PrismaPromoPushStore },
    {
      provide: PROMO_PUSH_INBOX,
      useExisting: NotificationsService,
    },
    {
      provide: PromoPushWorker,
      useFactory: (
        store: PrismaPromoPushStore,
        messaging: FirebaseMessagingPort,
        inbox: NotificationsService,
      ) => new PromoPushWorker(store, messaging, inbox).useEnv(process.env),
      inject: [PROMO_PUSH_STORE, FIREBASE_MESSAGING_PORT, PROMO_PUSH_INBOX],
    },
    {
      provide: PromoPushScheduler,
      useFactory: (store: PrismaPromoPushStore, worker: PromoPushWorker) =>
        new PromoPushScheduler(store, worker).useEnv(process.env),
      inject: [PROMO_PUSH_STORE, PromoPushWorker],
    },
  ],
  exports: [PROMO_PUSH_PUBLISHER, PromoPushPublisherService],
})
export class PromoPushModule {}
