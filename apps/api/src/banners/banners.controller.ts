import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  allowedVipPushTimingsForAllDates,
  VipPushTimingChoice,
} from '../promo-push/vip-push-timing';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BannersService } from './banners.service';

class VipPublicationDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsIn(['IMMEDIATE', 'SLOT_11', 'SLOT_17'])
  pushTiming!: VipPushTimingChoice;
}

class CreateBannerDto {
  @IsUrl({ require_tld: false })
  imageUrl!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dates?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vipDates?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  description?: string;

  @IsOptional()
  @IsIn(['PROMOTION', 'EVENT'])
  contentKind?: 'PROMOTION' | 'EVENT';

  /** Optional when the Idempotency-Key header is omitted (legacy clients). */
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VipPublicationDto)
  vipPublications?: VipPublicationDto[];
}

@Controller('banners')
@UseGuards(JwtAuthGuard)
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.bannersService.history(user.userId);
  }

  @Get('pricing')
  pricing() {
    return this.bannersService.pricing();
  }

  /** Opções de horário VIP válidas para as datas civis informadas (SP). */
  @Get('vip-push-options')
  vipPushOptions(@Query('dates') dates?: string) {
    const list =
      dates
        ?.split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0) ?? [];
    const options = allowedVipPushTimingsForAllDates(list, new Date());
    return {
      dates: list,
      options,
      officialSlots: ['11:00', '17:00'],
      timeZone: 'America/Sao_Paulo',
    };
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bannersService.cancel(user.userId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBannerDto,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    const idempotencyKey = idempotencyHeader?.trim() || dto.idempotencyKey;
    return this.bannersService.create(
      user.userId,
      dto.imageUrl,
      dto.dates ?? [],
      dto.title,
      dto.description,
      dto.contentKind ?? null,
      dto.vipDates ?? [],
      idempotencyKey,
      dto.vipPublications,
    );
  }
}
