import { Module } from '@nestjs/common';
import { AdminPushModule } from '../admin/push/admin-push.module';
import { CouponRedeemController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  imports: [AdminPushModule],
  controllers: [CouponRedeemController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
