import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId },
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
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
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
