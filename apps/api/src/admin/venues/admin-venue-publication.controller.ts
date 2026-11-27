import { Controller, Get, Param, Post } from '@nestjs/common';
import { AdminOnly } from '../guards/admin-only.decorator';
import { AdminVenuePublicationService } from './admin-venue-publication.service';

@Controller('admin/venues')
export class AdminVenuePublicationController {
  constructor(private readonly service: AdminVenuePublicationService) {}

  @Get(':venueId/publication')
  @AdminOnly()
  getPublication(@Param('venueId') venueId: string) {
    return this.service.status(venueId);
  }

  @Post(':venueId/publication/authorize')
  @AdminOnly()
  authorize(@Param('venueId') venueId: string) {
    return this.service.authorize(venueId);
  }

  @Post(':venueId/publication/revoke')
  @AdminOnly()
  revoke(@Param('venueId') venueId: string) {
    return this.service.revoke(venueId);
  }
}
