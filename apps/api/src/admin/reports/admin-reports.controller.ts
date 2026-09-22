import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { AdminOnly } from '../guards/admin-only.decorator';
import { ModerateReportDto } from './admin-reports.dto';
import { AdminReportsQueryDto } from './admin-reports.query';
import { AdminReportsService } from './admin-reports.service';

@Controller('admin/reports')
@AdminOnly()
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get()
  list(@Query() query: AdminReportsQueryDto) {
    return this.reports.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.reports.getById(id);
  }

  @Post(':id/restore-venue')
  @HttpCode(200)
  restoreVenue(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reports.restoreVenue(user.userId, id);
  }

  @Patch(':id')
  moderate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ModerateReportDto,
  ) {
    return this.reports.moderate(user.userId, id, dto);
  }
}
