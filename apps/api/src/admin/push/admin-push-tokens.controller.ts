import { Body, Controller, Delete, Post } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { AdminOnly } from '../guards/admin-only.decorator';
import {
  RegisterAdminPushTokenDto,
  UnregisterAdminPushTokenDto,
} from './admin-push-tokens.dto';
import { AdminPushTokensService } from './admin-push-tokens.service';

@Controller('admin/push-tokens')
@AdminOnly()
export class AdminPushTokensController {
  constructor(private readonly tokens: AdminPushTokensService) {}

  @Post()
  register(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterAdminPushTokenDto,
  ) {
    return this.tokens.register(user.userId, dto.token, dto.platform);
  }

  @Delete()
  unregister(
    @CurrentUser() user: AuthUser,
    @Body() dto: UnregisterAdminPushTokenDto,
  ) {
    return this.tokens.unregister(user.userId, dto.token);
  }
}
