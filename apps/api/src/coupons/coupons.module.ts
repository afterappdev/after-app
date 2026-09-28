import { Module } from '@nestjs/common';
import { CouponRedeemController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  controllers: [CouponRedeemController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
