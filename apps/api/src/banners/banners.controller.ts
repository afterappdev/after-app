import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BannersService } from './banners.service';

class CreateBannerDto {
  @IsUrl({ require_tld: false })
  imageUrl!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  dates!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  description?: string;
}

@Controller('banners')
@UseGuards(JwtAuthGuard)
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.bannersService.history(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBannerDto) {
    return this.bannersService.create(
      user.userId,
      dto.imageUrl,
      dto.dates,
      dto.title,
      dto.description,
    );
  }
}
