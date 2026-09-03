import { Controller, Get } from '@nestjs/common';
import { AdminOnly } from '../guards/admin-only.decorator';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin')
@AdminOnly()
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('dashboard')
  getDashboard() {
    return this.dashboard.getDashboard();
  }
}
