import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PromoPushModule } from '../promo-push/promo-push.module';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';

@Module({
  imports: [NotificationsModule, PromoPushModule],
  controllers: [BannersController],
  providers: [BannersService],
})
export class BannersModule {}
