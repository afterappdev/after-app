import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { CouponsService } from '../../coupons/coupons.service';
import { AdminOnly } from '../guards/admin-only.decorator';
import { paginate } from '../pagination';
import {
  AdminCouponWriteDto,
  AdminCouponsQueryDto,
  AdminCreateCouponDto,
} from './admin-coupons.dto';

@Controller('admin/coupons')
@AdminOnly()
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(@Query() query: AdminCouponsQueryDto) {
    const page = paginate(query.page, query.limit);
    return this.coupons.list(page.page, page.limit, page.skip);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: AdminCreateCouponDto) {
    return this.coupons.create(user, dto);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.coupons.getById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AdminCouponWriteDto) {
    return this.coupons.update(id, dto);
  }
}
