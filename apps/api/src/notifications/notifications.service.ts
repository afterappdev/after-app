import { Injectable } from '@nestjs/common';
import { AccountLifecycleStatus, Prisma } from '@prisma/client';
import {
  isVenuePubliclyVisible,
  publicVenueRelationWhere,
} from '../common/moderation/audience';
import { PrismaService } from '../prisma/prisma.service';
import { promoPushCopy } from '../promo-push/promo-push.copy';
import type { PromoPushInboxPort } from '../promo-push/promo-push.inbox-port';

export const VISIBLE_INBOX_LIMIT = 10;

const inboxOrderBy: Prisma.NotificationOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

function inboxWhere(userId: string): Prisma.NotificationWhereInput {
  return {
    userId,
    venue: {
      ...publicVenueRelationWhere(),
      blockedByUsers: { none: { userId } },
    },
  };
}

@Injectable()
export class NotificationsService implements PromoPushInboxPort {
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
      orderBy: inboxOrderBy,
      take: VISIBLE_INBOX_LIMIT,
    });
  }

  async unreadCount(userId: string) {
    const visible = await this.prisma.notification.findMany({
      where: inboxWhere(userId),
      select: { readAt: true },
      orderBy: inboxOrderBy,
      take: VISIBLE_INBOX_LIMIT,
    });
    return visible.filter((row) => row.readAt == null).length;
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
        ownerArchivedAt: true,
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

  async persistVipPromoInbox(params: {
    promoPushEventId: string;
    venueId: string;
    bannerId: string;
    venueName: string;
    contentKind: Parameters<typeof promoPushCopy>[1];
    bannerTitle: string | null;
    bannerDescription: string | null;
    userIds: string[];
  }) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: params.venueId },
      select: {
        moderationHiddenAt: true,
        ownerArchivedAt: true,
        owner: { select: { accountStatus: true } },
      },
    });
    if (!venue || !isVenuePubliclyVisible(venue)) {
      return;
    }

    const uniqueUserIds = [...new Set(params.userIds)];
    if (!uniqueUserIds.length) return;

    const copy = promoPushCopy(
      params.venueName,
      params.contentKind,
      params.bannerTitle,
      params.bannerDescription,
    );

    await this.prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        userId,
        venueId: params.venueId,
        bannerId: params.bannerId,
        promoPushEventId: params.promoPushEventId,
        title: copy.title,
        body: copy.body,
      })),
      skipDuplicates: true,
    });
  }
}
