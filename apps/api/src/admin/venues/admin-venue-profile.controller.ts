import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AdminOnly } from '../guards/admin-only.decorator';
import {
  AddAdminVenuePhotoDto,
  UpdateAdminVenueProfileDto,
} from './admin-venue-profile.dto';
import { AdminVenueProfileService } from './admin-venue-profile.service';

@Controller('admin/venues')
@AdminOnly()
export class AdminVenueProfileController {
  constructor(private readonly profiles: AdminVenueProfileService) {}

  @Get(':venueId/profile')
  get(@Param('venueId') venueId: string) {
    return this.profiles.get(venueId);
  }

  @Patch(':venueId/profile')
  save(
    @Param('venueId') venueId: string,
    @Body() dto: UpdateAdminVenueProfileDto,
  ) {
    return this.profiles.save(venueId, dto);
  }

  @Post(':venueId/photos')
  addPhoto(
    @Param('venueId') venueId: string,
    @Body() dto: AddAdminVenuePhotoDto,
  ) {
    return this.profiles.addPhoto(
      venueId,
      dto.url,
      dto.kind,
      dto.mediaType,
    );
  }

  @Delete(':venueId/photos/:photoId')
  removePhoto(
    @Param('venueId') venueId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.profiles.removePhoto(venueId, photoId);
  }
}
