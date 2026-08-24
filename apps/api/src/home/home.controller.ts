import { Controller, Get, Query } from '@nestjs/common';
import { HomeService } from './home.service';

@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get('promotions')
  promotions(
    @Query('city') city: string,
    @Query('date') date?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.homeService.promotions(city ?? '', date, lat, lng);
  }

  @Get('venues')
  venues(
    @Query('city') city: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.homeService.venues(city ?? '', lat, lng);
  }
}
