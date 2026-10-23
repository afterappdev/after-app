import { Module } from '@nestjs/common';
import { FcmModule } from '../../push/fcm.module';
import { AdminPushService } from './admin-push.service';
import { AdminPushTokensService } from './admin-push-tokens.service';

@Module({
  imports: [FcmModule],
  providers: [AdminPushService, AdminPushTokensService],
  exports: [AdminPushService, AdminPushTokensService],
})
export class AdminPushModule {}
