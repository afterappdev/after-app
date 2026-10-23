import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AdminOnly } from '../guards/admin-only.decorator';
import { parseYearMonthParam } from '../timezone';
import { AdminDashboardQueryDto } from './admin-dashboard.query';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin')
@AdminOnly()
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('dashboard')
  getDashboard(@Query() query: AdminDashboardQueryDto) {
    let selected;
    if (query.yearMonth) {
      try {
        selected = parseYearMonthParam(query.yearMonth);
      } catch {
        throw new BadRequestException('yearMonth inválido. Use YYYY-MM.');
      }
    }
    return this.dashboard.getDashboard(new Date(), selected);
  }
}
