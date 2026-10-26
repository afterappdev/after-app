import { Injectable } from '@nestjs/common';
import { AccountLifecycleStatus, Prisma } from '@prisma/client';
import { isVenuePubliclyVisible } from '../common/moderation/audience';
import { PrismaService } from '../prisma/prisma.service';

function inboxWhere(userId: string): Prisma.NotificationWhereInput {
  return {
    userId,
    venue: {
      moderationHiddenAt: null,
      owner: { accountStatus: AccountLifecycleStatus.ACTIVE },
      blockedByUsers: { none: { userId } },
    },
  };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: inboxWhere(userId),
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            coverUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { ...inboxWhere(userId), readAt: null },
    });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async notifyFavoriteFollowers(params: {
    venueId: string;
    venueName: string;
    bannerId: string;
    promoTitle?: string | null;
  }) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: params.venueId },
      select: {
        moderationHiddenAt: true,
        owner: { select: { accountStatus: true } },
      },
    });
    if (!venue || !isVenuePubliclyVisible(venue)) {
      return;
    }

    const followers = await this.prisma.favorite.findMany({
      where: {
        venueId: params.venueId,
        user: {
          accountStatus: AccountLifecycleStatus.ACTIVE,
          venueBlocks: { none: { venueId: params.venueId } },
        },
      },
      select: { userId: true },
    });
    if (!followers.length) return;

    const title = `${params.venueName} publicou uma promoção`;
    const body = params.promoTitle?.trim() || 'Confira a novidade no After';

    await this.prisma.notification.createMany({
      data: followers.map((f) => ({
        userId: f.userId,
        venueId: params.venueId,
        bannerId: params.bannerId,
        title,
        body,
      })),
    });
  }
}
