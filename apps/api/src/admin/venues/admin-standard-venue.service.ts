import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  StandardProfileStatus,
  VenueClaimStatus,
  VenueProfileKind,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AFTER_STANDARD_OWNER_USER_ID,
  listStandardProfilePublicationGaps,
  standardProfileReadyToPublish,
} from '../../venues/venue-standard-profile';
import { CreateAdminStandardVenueDto } from './admin-standard-venue.dto';
import { assertAdminStandardVenueCreateAllowed } from '../../venues/venue-registration-dedupe';
import {
  contactsStreetAddress,
  geocodeVenueProfile,
} from '../../common/utils/geo';

@Injectable()
export class AdminStandardVenueService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.venue.findMany({
      where: { profileKind: VenueProfileKind.STANDARD },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        category: true,
        logoUrl: true,
        contacts: true,
        hoursJson: true,
        standardProfileStatus: true,
        standardPublishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((venue) => ({
      ...venue,
      missingForPublish: listStandardProfilePublicationGaps(venue),
    }));
  }

  async create(dto: CreateAdminStandardVenueDto) {
    await this.assertStandardOwnerExists();
    const gaps = listStandardProfilePublicationGaps({
      name: dto.name,
      logoUrl: dto.logoUrl ?? null,
      category: dto.category,
      city: dto.city,
      state: dto.state,
      contacts: dto.contacts ?? {},
      hoursJson: dto.hoursJson ?? {},
    });
    if (gaps.some((gap) => gap.includes('cidade') || gap.includes('nome'))) {
      throw new BadRequestException('Nome, cidade, UF e categoria são obrigatórios.');
    }
    const address =
      dto.contacts &&
      typeof dto.contacts === 'object' &&
      !Array.isArray(dto.contacts) &&
      typeof (dto.contacts as { address?: unknown }).address === 'string'
        ? (dto.contacts as { address: string }).address
        : undefined;
    await assertAdminStandardVenueCreateAllowed(this.prisma, {
      name: dto.name,
      city: dto.city,
      state: dto.state,
      address,
    });
    return this.prisma.venue.create({
      data: {
        ownerUserId: AFTER_STANDARD_OWNER_USER_ID,
        profileKind: VenueProfileKind.STANDARD,
        standardProfileStatus: StandardProfileStatus.DRAFT,
        publicacaoAutorizada: false,
        name: dto.name.trim(),
        city: dto.city.trim(),
        state: dto.state.trim().toUpperCase(),
        category: dto.category.trim(),
        logoUrl: dto.logoUrl?.trim() || null,
        menuUrl: dto.menuUrl ?? null,
        contacts: dto.contacts ?? {},
        hoursJson: dto.hoursJson ?? {},
      },
      select: this.detailSelect(),
    });
  }

  async publish(venueId: string) {
    const venue = await this.requireStandard(venueId);
    if (venue.standardProfileStatus === StandardProfileStatus.PUBLISHED) {
      return this.present(venue);
    }
    if (!standardProfileReadyToPublish(venue)) {
      throw new BadRequestException({
        message: 'Perfil padrão incompleto para publicação.',
        missingForPublish: listStandardProfilePublicationGaps(venue),
      });
    }
    const point = await geocodeVenueProfile({
      address: contactsStreetAddress(venue.contacts),
      city: venue.city,
      state: venue.state,
    });
    const updated = await this.prisma.venue.update({
      where: { id: venueId },
      data: {
        standardProfileStatus: StandardProfileStatus.PUBLISHED,
        standardPublishedAt: new Date(),
        standardUnpublishedAt: null,
        ...(point ? { lat: point.lat, lng: point.lng } : {}),
      },
      select: this.detailSelect(),
    });
    return this.present(updated);
  }

  async unpublish(venueId: string) {
    const venue = await this.requireStandard(venueId);
    if (venue.standardProfileStatus !== StandardProfileStatus.PUBLISHED) {
      return this.present(venue);
    }
    await this.prisma.venueClaim.updateMany({
      where: {
        venueId,
        status: {
          in: [VenueClaimStatus.RECEIVED, VenueClaimStatus.INVITE_SENT],
        },
      },
      data: { status: VenueClaimStatus.INVITE_EXPIRED },
    });
    const updated = await this.prisma.venue.update({
      where: { id: venueId },
      data: {
        standardProfileStatus: StandardProfileStatus.DRAFT,
        standardUnpublishedAt: new Date(),
      },
      select: this.detailSelect(),
    });
    return this.present(updated);
  }

  private async requireStandard(venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: this.detailSelect(),
    });
    if (!venue || venue.profileKind !== VenueProfileKind.STANDARD) {
      throw new NotFoundException('Perfil padrão não encontrado');
    }
    return venue;
  }

  private async assertStandardOwnerExists() {
    const owner = await this.prisma.user.findUnique({
      where: { id: AFTER_STANDARD_OWNER_USER_ID },
      select: { id: true, systemAccount: true },
    });
    if (!owner?.systemAccount) {
      throw new BadRequestException(
        'Conta técnica de perfis padrão não configurada. Execute a migração mais recente.',
      );
    }
  }

  private detailSelect() {
    return {
      id: true,
      name: true,
      city: true,
      state: true,
      category: true,
      logoUrl: true,
      coverUrl: true,
      menuUrl: true,
      contacts: true,
      hoursJson: true,
      profileKind: true,
      standardProfileStatus: true,
      standardPublishedAt: true,
      standardUnpublishedAt: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private present(
    venue: NonNullable<Awaited<ReturnType<typeof this.requireStandard>>>,
  ) {
    return {
      ...venue,
      missingForPublish: listStandardProfilePublicationGaps(venue),
    };
  }
}