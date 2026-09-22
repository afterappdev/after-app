import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  blockedVenueIdsForUser,
  publicVenueWhere,
} from '../common/moderation/audience';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const blockedIds = await blockedVenueIdsForUser(this.prisma, {
      userId,
      email: '',
      role: 'USER',
    });
    return this.prisma.favorite.findMany({
      where: {
        userId,
        venue: publicVenueWhere(blockedIds),
      },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            coverUrl: true,
            city: true,
            state: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async add(userId: string, venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, moderationHiddenAt: true },
    });
    if (!venue || venue.moderationHiddenAt) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    const blocked = await this.prisma.userVenueBlock.findUnique({
      where: { userId_venueId: { userId, venueId } },
    });
    if (blocked) {
      throw new ForbiddenException(
        'Desbloqueie o estabelecimento para adicioná-lo aos favoritos',
      );
    }

    return this.prisma.favorite.upsert({
      where: { userId_venueId: { userId, venueId } },
      create: { userId, venueId },
      update: {},
      include: { venue: true },
    });
  }

  async remove(userId: string, venueId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, venueId } });
    return { ok: true };
  }
}
