import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { HomeService } from './home.service';

@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get('promotions')
  @UseGuards(OptionalJwtAuthGuard)
  promotions(
    @Query('city') city: string,
    @CurrentUser() user?: AuthUser,
    @Query('date') date?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.homeService.promotions(city ?? '', date, lat, lng, user);
  }

  @Get('venues')
  @UseGuards(OptionalJwtAuthGuard)
  venues(
    @Query('city') city: string,
    @CurrentUser() user?: AuthUser,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.homeService.venues(city ?? '', lat, lng, user);
  }
}
