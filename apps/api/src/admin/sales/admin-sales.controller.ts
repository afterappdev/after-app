import { Controller, Get, Param, Query } from '@nestjs/common';
import { AdminOnly } from '../guards/admin-only.decorator';
import {
  AdminSalesMonthlyQueryDto,
  AdminSalesQueryDto,
} from './admin-sales.query';
import { AdminSalesService } from './admin-sales.service';

@Controller('admin/sales')
@AdminOnly()
export class AdminSalesController {
  constructor(private readonly sales: AdminSalesService) {}

  @Get()
  list(@Query() query: AdminSalesQueryDto) {
    return this.sales.list(query);
  }

  @Get('monthly')
  monthly(@Query() query: AdminSalesMonthlyQueryDto) {
    return this.sales.monthly(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.sales.getById(id);
  }
}
