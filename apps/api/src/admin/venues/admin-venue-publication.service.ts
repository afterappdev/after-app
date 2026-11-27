import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  listVenuePublicationProfileGaps,
  venueVisibleToStrangerDiscovery,
} from '../../venues/venue-publication';
import {
  isStandardVenue,
  listStandardProfilePublicationGaps,
} from '../../venues/venue-standard-profile';

const STATUS_SELECT = {
  id: true,
  name: true,
  ownerUserId: true,
  moderationHiddenAt: true,
  publicacaoAutorizada: true,
  profileKind: true,
  standardProfileStatus: true,
  category: true,
  city: true,
  state: true,
  logoUrl: true,
  coverUrl: true,
  contacts: true,
  hoursJson: true,
} as const;

type VenuePublicationStatus = Prisma.VenueGetPayload<{
  select: typeof STATUS_SELECT;
}>;

function missingPublicationGaps(venue: VenuePublicationStatus) {
  return isStandardVenue(venue)
    ? listStandardProfilePublicationGaps(venue)
    : listVenuePublicationProfileGaps(venue);
}

@Injectable()
export class AdminVenuePublicationService {
  constructor(private readonly prisma: PrismaService) {}

  async status(venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: STATUS_SELECT,
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    const gaps = missingPublicationGaps(venue);
    return {
      venueId: venue.id,
      name: venue.name,
      publicacaoAutorizada: venue.publicacaoAutorizada,
      profileKind: venue.profileKind,
      standardProfileStatus: venue.standardProfileStatus,
      visibleToPublicGuest: venueVisibleToStrangerDiscovery(venue),
      missingForProfile: gaps,
    };
  }

  async authorize(venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: STATUS_SELECT,
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (isStandardVenue(venue)) {
      throw new BadRequestException(
        'Perfis padrão usam publicar/retirar em Estabelecimentos → Perfis padrão.',
      );
    }
    const gaps = missingPublicationGaps(venue);
    if (gaps.length > 0) {
      throw new BadRequestException({
        message: 'Perfil incompleto para autorizar publicação.',
        missing: gaps,
      });
    }
    const updated = await this.prisma.venue.update({
      where: { id: venueId },
      data: { publicacaoAutorizada: true },
      select: {
        id: true,
        publicacaoAutorizada: true,
      },
    });
    return {
      ok: true,
      venueId: updated.id,
      publicacaoAutorizada: updated.publicacaoAutorizada,
      missingForProfile: [] as string[],
    };
  }

  async revoke(venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, profileKind: true },
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (isStandardVenue(venue)) {
      throw new BadRequestException(
        'Perfis padrão usam publicar/retirar em Estabelecimentos → Perfis padrão.',
      );
    }
    await this.prisma.venue.update({
      where: { id: venueId },
      data: { publicacaoAutorizada: false },
    });
    return { ok: true, venueId, publicacaoAutorizada: false };
  }
}
