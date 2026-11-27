import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaType, PhotoKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { listStandardProfilePublicationGaps } from '../../venues/venue-standard-profile';
import { listVenuePublicationProfileGaps } from '../../venues/venue-publication';
import { VenueProfileKind } from '@prisma/client';
import {
  PublicVenueProfilePatch,
  VenuesService,
} from '../../venues/venues.service';
import { UpdateAdminVenueProfileDto } from './admin-venue-profile.dto';

const PROFILE_SELECT = {
  id: true,
  name: true,
  city: true,
  state: true,
  category: true,
  profileKind: true,
  standardProfileStatus: true,
  logoUrl: true,
  coverUrl: true,
  menuUrl: true,
  contacts: true,
  hoursJson: true,
  photos: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      url: true,
      kind: true,
      mediaType: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.VenueSelect;

@Injectable()
export class AdminVenueProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly venues: VenuesService,
  ) {}

  async get(venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: PROFILE_SELECT,
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    return this.present(venue);
  }

  async save(venueId: string, dto: UpdateAdminVenueProfileDto) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    await this.venues.persistPublicProfile(venue, this.patchFrom(dto));
    return this.get(venueId);
  }

  addPhoto(
    venueId: string,
    url: string,
    kind: PhotoKind,
    mediaType?: MediaType,
  ) {
    return this.venues.addPhotoForAdmin(venueId, url, kind, mediaType);
  }

  removePhoto(venueId: string, photoId: string) {
    return this.venues.removePhotoForAdmin(venueId, photoId);
  }

  private patchFrom(dto: UpdateAdminVenueProfileDto): PublicVenueProfilePatch {
    const patch: PublicVenueProfilePatch = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length < 2) {
        throw new BadRequestException(
          'O nome do estabelecimento precisa de pelo menos 2 caracteres.',
        );
      }
      patch.name = name;
    }
    if (dto.city !== undefined) {
      const city = dto.city.trim();
      if (!city) {
        throw new BadRequestException('Informe a cidade.');
      }
      patch.city = city;
    }
    if (dto.state !== undefined) {
      const state = dto.state.trim().toUpperCase();
      if (state.length < 2) {
        throw new BadRequestException('Informe a UF.');
      }
      patch.state = state;
    }
    if (dto.category !== undefined) {
      const category = dto.category.trim();
      if (!category) {
        throw new BadRequestException('Informe a categoria.');
      }
      patch.category = category;
    }
    if (dto.logoUrl !== undefined) patch.logoUrl = dto.logoUrl.trim();
    if (dto.coverUrl !== undefined) patch.coverUrl = dto.coverUrl.trim();
    if (dto.contacts !== undefined) patch.contacts = dto.contacts;
    if (dto.hoursJson !== undefined) patch.hoursJson = dto.hoursJson;
    if (dto.menuUrl !== undefined) patch.menuUrl = dto.menuUrl;
    return patch;
  }

  private present(
    venue: Prisma.VenueGetPayload<{ select: typeof PROFILE_SELECT }>,
  ) {
    const gaps =
      venue.profileKind === VenueProfileKind.STANDARD
        ? listStandardProfilePublicationGaps(venue)
        : listVenuePublicationProfileGaps(venue);
    return {
      id: venue.id,
      name: venue.name,
      city: venue.city,
      state: venue.state,
      category: venue.category,
      profileKind: venue.profileKind,
      standardProfileStatus: venue.standardProfileStatus,
      logoUrl: venue.logoUrl,
      coverUrl: venue.coverUrl,
      menuUrl: venue.menuUrl,
      contacts: venue.contacts ?? {},
      hoursJson: venue.hoursJson ?? {},
      photos: venue.photos,
      missingForProfile: gaps,
    };
  }
}
