import { Controller, Get, Param, Query } from '@nestjs/common';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('states')
  states() {
    return this.locationsService.listStates();
  }

  @Get('cities')
  searchCities(@Query('q') q?: string) {
    return this.locationsService.searchCities(q ?? '');
  }

  @Get('states/:uf/cities')
  cities(@Param('uf') uf: string) {
    return this.locationsService.listCities(uf);
  }
}
