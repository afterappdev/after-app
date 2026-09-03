import { Controller, Get, Param, Query } from '@nestjs/common';
import { AdminOnly } from '../guards/admin-only.decorator';
import { AdminAccountsQueryDto } from './admin-accounts.query';
import { AdminAccountsService } from './admin-accounts.service';

@Controller('admin/accounts')
@AdminOnly()
export class AdminAccountsController {
  constructor(private readonly accounts: AdminAccountsService) {}

  @Get()
  list(@Query() query: AdminAccountsQueryDto) {
    return this.accounts.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.accounts.getById(id);
  }
}
