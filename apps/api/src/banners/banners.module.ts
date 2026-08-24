import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';

@Module({
  imports: [NotificationsModule],
  controllers: [BannersController],
  providers: [BannersService],
})
export class BannersModule {}
