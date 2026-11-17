import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  listVenuePublicationProfileGaps,
  venueVisibleToStrangerDiscovery,
} from '../../venues/venue-publication';

const STATUS_SELECT = {
  id: true,
  name: true,
  ownerUserId: true,
  moderationHiddenAt: true,
  publicacaoAutorizada: true,
  logoUrl: true,
  coverUrl: true,
  contacts: true,
  hoursJson: true,
} as const;

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
    const gaps = listVenuePublicationProfileGaps(venue);
    return {
      venueId: venue.id,
      name: venue.name,
      publicacaoAutorizada: venue.publicacaoAutorizada,
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
    const gaps = listVenuePublicationProfileGaps(venue);
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
      select: { id: true },
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    await this.prisma.venue.update({
      where: { id: venueId },
      data: { publicacaoAutorizada: false },
    });
    return { ok: true, venueId, publicacaoAutorizada: false };
  }
}
