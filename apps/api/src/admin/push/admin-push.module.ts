import { Logger, Module } from '@nestjs/common';
import { AdminPushService } from './admin-push.service';
import { AdminPushTokensService } from './admin-push-tokens.service';
import { createFirebaseMessagingPort } from './firebase-messaging.factory';
import { FIREBASE_MESSAGING_PORT } from './firebase-messaging.port';

@Module({
  providers: [
    {
      provide: FIREBASE_MESSAGING_PORT,
      useFactory: () => createFirebaseMessagingPort(new Logger('AdminFcm')),
    },
    AdminPushService,
    AdminPushTokensService,
  ],
  exports: [AdminPushService, AdminPushTokensService],
})
export class AdminPushModule {}
