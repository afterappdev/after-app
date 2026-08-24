import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async history(userId: string) {
    const venue = await this.requireVenueOwned(userId);
    return this.prisma.banner.findMany({
      where: { venueId: venue.id },
      include: { schedules: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Creates a banner for the given display dates.
   * Cost = dates.length * CREDIT_PER_DISPLAY_DAY (default 1).
   */
  async create(
    userId: string,
    imageUrl: string,
    dates: string[],
    title?: string,
    description?: string,
  ) {
    if (!dates.length) {
      throw new BadRequestException('Informe ao menos uma data');
    }

    const venue = await this.requireVenueOwned(userId);
    const perDay = Number(this.config.get('CREDIT_PER_DISPLAY_DAY') ?? 1);
    const creditsCost = dates.length * perDay;

    const wallet = await this.prisma.creditWallet.findUnique({
      where: { venueId: venue.id },
    });
    if (!wallet || wallet.balance < creditsCost) {
      throw new BadRequestException('Saldo de créditos insuficiente');
    }

    const banner = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.creditWallet.updateMany({
        where: { venueId: venue.id, balance: { gte: creditsCost } },
        data: { balance: { decrement: creditsCost } },
      });
      if (updated.count === 0) {
        throw new BadRequestException('Saldo de créditos insuficiente');
      }

      return tx.banner.create({
        data: {
          venueId: venue.id,
          imageUrl,
          title: title?.trim() || null,
          description: description?.trim() || null,
          creditsCost,
          status: 'ACTIVE',
          schedules: {
            create: dates.map((d) => ({
              displayDate: parseDateOnly(d),
              citySnapshot: venue.city,
            })),
          },
        },
        include: { schedules: true },
      });
    });

    try {
      await this.notifications.notifyFavoriteFollowers({
        venueId: venue.id,
        venueName: venue.name,
        bannerId: banner.id,
        promoTitle: title,
      });
    } catch {
      // Publishing still succeeds if inbox fan-out fails.
    }

    return banner;
  }

  private async requireVenueOwned(userId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { ownerUserId: userId },
    });
    if (!venue) {
      throw new ForbiddenException('Conta não é de estabelecimento');
    }
    return venue;
  }
}

/** Parses YYYY-MM-DD as a UTC date-only value for Prisma @db.Date. */
function parseDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) {
    throw new BadRequestException(`Data inválida: ${value}`);
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
