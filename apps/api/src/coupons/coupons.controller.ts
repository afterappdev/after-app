import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CouponsService } from './coupons.service';
import { ActiveVenueId } from '../common/decorators/active-venue.decorator';

class RedeemCouponDto {
  @IsString()
  @MaxLength(40)
  code!: string;
}

@Controller('credits/coupons')
@UseGuards(JwtAuthGuard)
export class CouponRedeemController {
  constructor(private readonly coupons: CouponsService) {}

  @Post('redeem')
  redeem(
    @CurrentUser() user: AuthUser,
    @Body() dto: RedeemCouponDto,
    @ActiveVenueId() activeVenueId?: string,
  ) {
    return this.coupons.redeem(user, dto.code, activeVenueId);
  }
}
