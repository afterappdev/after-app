import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { AdminOnly } from '../guards/admin-only.decorator';
import {
  AdminFinanceCreateDto,
  AdminFinanceOverviewQueryDto,
  AdminFinanceQueryDto,
} from './admin-finance.dto';
import { AdminFinanceService } from './admin-finance.service';

@Controller('admin/finance')
@AdminOnly()
export class AdminFinanceController {
  constructor(private readonly finance: AdminFinanceService) {}

  @Get('overview')
  overview(@Query() query: AdminFinanceOverviewQueryDto) {
    return this.finance.overview(query.yearMonth);
  }

  @Get('movements')
  list(@Query() query: AdminFinanceQueryDto) {
    return this.finance.list(query);
  }

  @Post('entries')
  create(@CurrentUser() user: AuthUser, @Body() dto: AdminFinanceCreateDto) {
    return this.finance.create(user.userId, dto);
  }
}
