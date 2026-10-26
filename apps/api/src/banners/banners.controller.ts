import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BannersService } from './banners.service';

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
    );
  }
}
