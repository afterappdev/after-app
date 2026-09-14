import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CREDIT_PACKAGES } from '../common/constants/credits';
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
  @IsIn(PACKAGE_KEYS)
  packageKey!: (typeof PACKAGE_KEYS)[number];
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

  @Post('dev-confirm/:purchaseId')
  confirmDev(
    @CurrentUser() user: AuthUser,
    @Param('purchaseId') purchaseId: string,
  ) {
    return this.creditsService.confirmPurchaseDev(user.userId, purchaseId);
  }
}
