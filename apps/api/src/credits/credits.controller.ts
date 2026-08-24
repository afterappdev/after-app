import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString, MinLength } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CREDIT_PACKAGES } from '../common/constants/credits';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreditsService } from './credits.service';

const PACKAGE_KEYS = CREDIT_PACKAGES.map((p) => p.key);
const STORE_PROVIDERS = ['google_play', 'app_store'] as const;

class CheckoutDto {
  @IsString()
  @IsIn(PACKAGE_KEYS)
  packageKey!: (typeof PACKAGE_KEYS)[number];
}

class StoreConfirmDto {
  @IsString()
  @IsIn(PACKAGE_KEYS)
  packageKey!: (typeof PACKAGE_KEYS)[number];

  @IsString()
  productId!: string;

  @IsString()
  @IsIn(STORE_PROVIDERS)
  provider!: (typeof STORE_PROVIDERS)[number];

  @IsString()
  purchaseId!: string;

  @IsString()
  @MinLength(1)
  verificationData!: string;
}

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get('packages')
  packages() {
    return this.creditsService.packages();
  }

  @Get('wallet')
  wallet(@CurrentUser() user: AuthUser) {
    return this.creditsService.wallet(user.userId);
  }

  @Get('purchases')
  purchases(@CurrentUser() user: AuthUser) {
    return this.creditsService.purchases(user.userId);
  }

  @Post('checkout')
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.creditsService.checkout(user.userId, dto.packageKey);
  }

  @Post('store-confirm')
  storeConfirm(@CurrentUser() user: AuthUser, @Body() dto: StoreConfirmDto) {
    return this.creditsService.confirmStorePurchase(user.userId, dto);
  }

  @Post('dev-confirm/:purchaseId')
  confirmDev(
    @CurrentUser() user: AuthUser,
    @Param('purchaseId') purchaseId: string,
  ) {
    return this.creditsService.confirmPurchaseDev(user.userId, purchaseId);
  }
}
