import { Global, Logger, Module } from '@nestjs/common';
import { createFirebaseMessagingPort } from '../admin/push/firebase-messaging.factory';
import { FIREBASE_MESSAGING_PORT } from '../admin/push/firebase-messaging.port';

@Global()
@Module({
  providers: [
    {
      provide: FIREBASE_MESSAGING_PORT,
      useFactory: () => createFirebaseMessagingPort(new Logger('Fcm')),
    },
  ],
  exports: [FIREBASE_MESSAGING_PORT],
})
export class FcmModule {}
