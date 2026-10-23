import { Body, Controller, Delete, Get, Put, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { PromoPushAccountService } from './promo-push.account';
import {
  RegisterPromoPushTokenDto,
  UnregisterPromoPushTokenDto,
  UpdatePromoLocationDto,
  UpdatePromoPreferenceDto,
} from './promo-push.dto';

@Controller('promo-notifications')
@UseGuards(JwtAuthGuard)
export class PromoPushController {
  constructor(private readonly account: PromoPushAccountService) {}

  @Get('preferences')
  preferences(@CurrentUser() user: AuthUser) {
    return this.account.getPreferences(user.userId);
  }

  @Put('preferences')
  setPreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePromoPreferenceDto,
  ) {
    return this.account.setEnabled(user.userId, dto.enabled);
  }

  @Put('location')
  setLocation(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePromoLocationDto,
  ) {
    return this.account.setLocation(user.userId, dto);
  }

  @Post('tokens')
  registerToken(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterPromoPushTokenDto,
  ) {
    return this.account.registerToken(user.userId, dto.token, dto.platform);
  }

  @Delete('tokens')
  unregisterToken(
    @CurrentUser() user: AuthUser,
    @Body() dto: UnregisterPromoPushTokenDto,
  ) {
    return this.account.unregisterToken(user.userId, dto.token);
  }
}
