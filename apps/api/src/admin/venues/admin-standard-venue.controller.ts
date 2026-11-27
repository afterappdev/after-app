import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AdminOnly } from '../guards/admin-only.decorator';
import { CreateAdminStandardVenueDto } from './admin-standard-venue.dto';
import { AdminStandardVenueService } from './admin-standard-venue.service';

@Controller('admin/venues/standard-profiles')
@AdminOnly()
export class AdminStandardVenueController {
  constructor(private readonly standard: AdminStandardVenueService) {}

  @Get()
  list() {
    return this.standard.list();
  }

  @Post()
  create(@Body() dto: CreateAdminStandardVenueDto) {
    return this.standard.create(dto);
  }

  @Post(':venueId/publish')
  publish(@Param('venueId') venueId: string) {
    return this.standard.publish(venueId);
  }

  @Post(':venueId/unpublish')
  unpublish(@Param('venueId') venueId: string) {
    return this.standard.unpublish(venueId);
  }
}