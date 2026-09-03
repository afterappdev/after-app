import { Controller, Get } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { AdminOnly } from '../guards/admin-only.decorator';
import { AdminMeService } from './admin-me.service';

@Controller('admin')
@AdminOnly()
export class AdminMeController {
  constructor(private readonly meService: AdminMeService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.meService.me(user.userId);
  }
}
