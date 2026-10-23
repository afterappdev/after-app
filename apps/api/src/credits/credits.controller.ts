import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CREDIT_PACKAGES } from '../common/constants/credits';
import { VIP_CREDIT_PACKAGES } from './vip-catalog';
import { WEB_CREDIT_PACKAGE_KEYS } from './vip-web-checkout';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreditsService } from './credits.service';
import { STORE_PROVIDER_INPUTS } from './providers/payment-provider';
import { FiscalPurchaseInput } from './fiscal-document';

const PACKAGE_KEYS = CREDIT_PACKAGES.map((p) => p.key);

class FiscalFieldsDto implements FiscalPurchaseInput {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  invoiceRequested?: boolean;

  @ValidateIf((dto: FiscalFieldsDto) => dto.invoiceRequested === true)
  @IsString()
  @IsIn(['CPF', 'CNPJ'])
  fiscalPersonType?: string;

  @ValidateIf((dto: FiscalFieldsDto) => dto.invoiceRequested === true)
  @IsString()
  @MaxLength(150)
  fiscalName?: string;

  @ValidateIf((dto: FiscalFieldsDto) => dto.invoiceRequested === true)
  @IsString()
  @MaxLength(18)
  fiscalDocument?: string;

  @ValidateIf((dto: FiscalFieldsDto) => dto.invoiceRequested === true)
  @IsEmail()
  @MaxLength(120)
  fiscalEmail?: string;
}

class CheckoutDto {
  @IsString()
  @IsIn(PACKAGE_KEYS)
  packageKey!: (typeof PACKAGE_KEYS)[number];
}

class StoreConfirmDto extends FiscalFieldsDto {
  @IsString()
  @IsIn(PACKAGE_KEYS)
  packageKey!: (typeof PACKAGE_KEYS)[number];

  @IsString()
  productId!: string;

  @IsString()
  @IsIn([...STORE_PROVIDER_INPUTS])
  provider!: (typeof STORE_PROVIDER_INPUTS)[number];

  @IsString()
  purchaseId!: string;

  @IsString()
  @MinLength(1)
  verificationData!: string;
}

class PixCreateDto extends FiscalFieldsDto {
  @IsString()
  @IsIn(WEB_CREDIT_PACKAGE_KEYS)
  packageKey!: (typeof WEB_CREDIT_PACKAGE_KEYS)[number];
}

export class CardPayDto extends FiscalFieldsDto {
  @IsString()
  @IsIn(WEB_CREDIT_PACKAGE_KEYS)
  packageKey!: (typeof WEB_CREDIT_PACKAGE_KEYS)[number];

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{16,64}$/)
  idempotencyKey!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{20,256}$/)
  token!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_]{2,32}$/)
  paymentMethodId!: string;

  @IsString()
  @IsIn(['credit_card'])
  paymentType!: 'credit_card';

  @Type(() => Number)
  @IsInt()
  @Equals(1)
  installments!: number;
}

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get('packages')
  packages() {
    return this.creditsService.packages();
  }

  @Get('vip-packages')
  vipPackages() {
    return VIP_CREDIT_PACKAGES;
  }

  @Get('wallet')
  wallet(@CurrentUser() user: AuthUser) {
    return this.creditsService.wallet(user.userId);
  }

  @Get('purchases')
  purchases(@CurrentUser() user: AuthUser) {
    return this.creditsService.purchases(user.userId);
  }

  @Get('purchases/:id')
  purchaseById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.creditsService.purchaseById(user.userId, id);
  }

  @Post('checkout')
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.creditsService.checkout(user.userId, dto.packageKey);
  }

  @Post('store-confirm')
  storeConfirm(@CurrentUser() user: AuthUser, @Body() dto: StoreConfirmDto) {
    return this.creditsService.confirmStorePurchase(user.userId, dto);
  }

  @Post('pix/create')
  createPix(@CurrentUser() user: AuthUser, @Body() dto: PixCreateDto) {
    return this.creditsService.createPixCharge(
      user.userId,
      dto.packageKey,
      user.email,
      dto,
    );
  }

  @Get('card/config')
  cardConfig() {
    return this.creditsService.cardCheckoutConfig();
  }

  @Post('card/pay')
  @HttpCode(200)
  payCard(@CurrentUser() user: AuthUser, @Body() dto: CardPayDto) {
    return this.creditsService.payCard(user.userId, dto, user.email);
  }

  @Post('dev-confirm/:purchaseId')
  confirmDev(
    @CurrentUser() user: AuthUser,
    @Param('purchaseId') purchaseId: string,
  ) {
    return this.creditsService.confirmPurchaseDev(user.userId, purchaseId);
  }
}
