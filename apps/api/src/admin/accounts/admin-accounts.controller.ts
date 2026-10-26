import { Controller, Delete, Get, HttpCode, Param, Query } from '@nestjs/common';
import { AdminOnly } from '../guards/admin-only.decorator';
import { AdminAccountsQueryDto } from './admin-accounts.query';
import { AdminAccountsStatsQueryDto } from './admin-accounts.stats.query';
import { AdminAccountRemoveQueryDto } from './admin-accounts.remove.query';
import { AdminAccountsService } from './admin-accounts.service';

@Controller('admin/accounts')
@AdminOnly()
export class AdminAccountsController {
  constructor(private readonly accounts: AdminAccountsService) {}

  @Get()
  list(@Query() query: AdminAccountsQueryDto) {
    return this.accounts.list(query);
  }

  @Get('cities')
  cities() {
    return this.accounts.cities();
  }

  @Get('stats')
  stats(@Query() query: AdminAccountsStatsQueryDto) {
    return this.accounts.stats(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.accounts.getById(id);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @Query() query: AdminAccountRemoveQueryDto) {
    return this.accounts.remove(id, query.strategy ?? 'hard');
  }
}
