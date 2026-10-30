import { Injectable } from '@nestjs/common';
import { AccountLifecycleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AudienceCandidate,
  canClaimPromoPushEvent,
  promoAudienceWhere,
} from './promo-push.audience';
import { PromoContentKind } from './promo-push.copy';

export type PromoPushEventView = {
  id: string;
  bannerId: string;
  venueId: string;
  scheduleId: string;
  ibgeCityId: number;
  contentKind: PromoContentKind;
  venueName: string;
  bannerTitle: string | null;
  venueLogoUrl: string | null;
  bannerStatus: string;
  venueHidden: boolean;
  scheduleTier: string;
  vipCreditEntryId: string | null;
  attempts: number;
  availableAt: Date;
  expiresAt: Date;
};

export type PromoPushFinish = {
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  error: string | null;
  availableAt?: Date;
  sentAt?: Date | null;
  targetedUsers?: number;
  targetedTokens?: number;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
};

export type DeliveryClaim = {
  tokenId: string;
  token: string;
  userId: string;
  alreadySent: boolean;
};

export interface PromoPushStore {
  acquireLock(workerId: string, now: Date, leaseMs: number): Promise<boolean>;
  releaseLock(workerId: string, now: Date): Promise<void>;
  expireOverdue(now: Date): Promise<number>;
  listReadyIds(now: Date, limit: number): Promise<string[]>;
  claim(
    id: string,
    workerId: string,
    now: Date,
    leaseMs: number,
  ): Promise<boolean>;
  load(id: string): Promise<PromoPushEventView | null>;
  loadAudience(
    event: PromoPushEventView,
    freshAfter: Date,
    allowlist: string[] | null,
  ): Promise<AudienceCandidate[]>;
  recentEventCounts(
    userIds: string[],
    since: Date,
    exceptEventId: string,
  ): Promise<Map<string, number>>;
  claimDeliveries(
    eventId: string,
    items: { tokenId: string; token: string; userId: string }[],
  ): Promise<DeliveryClaim[]>;
  markDeliveries(
    updates: {
      eventId: string;
      tokenId: string;
      status: 'SENT' | 'INVALID' | 'CLAIMED';
      error: string | null;
      sentAt: Date | null;
    }[],
  ): Promise<void>;
  disableToken(tokenId: string, now: Date): Promise<void>;
  finish(id: string, workerId: string, patch: PromoPushFinish): Promise<void>;
  release(id: string, workerId: string, attempts: number): Promise<void>;
}

const readyWhere = (now: Date): Prisma.PromoPushEventWhereInput => ({
  status: { in: ['PENDING', 'PROCESSING'] },
  availableAt: { lte: now },
  expiresAt: { gt: now },
  OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
});

@Injectable()
export class PrismaPromoPushStore implements PromoPushStore {
  constructor(private readonly prisma: PrismaService) {}

  async acquireLock(
    workerId: string,
    now: Date,
    leaseMs: number,
  ): Promise<boolean> {
    const lockedUntil = new Date(now.getTime() + leaseMs);
    const updated = await this.prisma.promoPushWorkerLock.updateMany({
      where: { id: 1, lockedUntil: { lt: now } },
      data: { lockedUntil, lockedBy: workerId },
    });
    if (updated.count === 1) return true;
    try {
      await this.prisma.promoPushWorkerLock.create({
        data: { id: 1, lockedUntil, lockedBy: workerId },
      });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }

  async releaseLock(workerId: string, now: Date): Promise<void> {
    await this.prisma.promoPushWorkerLock.updateMany({
      where: { id: 1, lockedBy: workerId },
      data: { lockedUntil: now },
    });
  }

  async expireOverdue(now: Date): Promise<number> {
    const result = await this.prisma.promoPushEvent.updateMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        expiresAt: { lte: now },
      },
      data: {
        status: 'SKIPPED',
        error: 'WINDOW_CLOSED',
        lockedUntil: null,
        lockedBy: null,
      },
    });
    return result.count;
  }

  async listReadyIds(now: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.promoPushEvent.findMany({
      where: readyWhere(now),
      select: { id: true },
      orderBy: { availableAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => row.id);
  }

  async claim(
    id: string,
    workerId: string,
    now: Date,
    leaseMs: number,
  ): Promise<boolean> {
    const updated = await this.prisma.promoPushEvent.updateMany({
      where: { id, ...readyWhere(now) },
      data: {
        status: 'PROCESSING',
        lockedUntil: new Date(now.getTime() + leaseMs),
        lockedBy: workerId,
        attempts: { increment: 1 },
      },
    });
    return updated.count === 1;
  }

  async load(id: string): Promise<PromoPushEventView | null> {
    const row = await this.prisma.promoPushEvent.findUnique({
      where: { id },
      include: {
        bannerSchedule: {
          include: {
            banner: {
              select: {
                status: true,
                title: true,
                venue: {
                  select: {
                    name: true,
                    logoUrl: true,
                    moderationHiddenAt: true,
                    owner: { select: { accountStatus: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      bannerId: row.bannerId,
      venueId: row.venueId,
      scheduleId: row.bannerScheduleId,
      ibgeCityId: row.ibgeCityId,
      contentKind: row.contentKind,
      venueName: row.bannerSchedule.banner.venue.name,
      bannerTitle: row.bannerSchedule.banner.title,
      venueLogoUrl: row.bannerSchedule.banner.venue.logoUrl,
      bannerStatus: row.bannerSchedule.banner.status,
      venueHidden:
        row.bannerSchedule.banner.venue.moderationHiddenAt != null ||
        row.bannerSchedule.banner.venue.owner.accountStatus !==
          AccountLifecycleStatus.ACTIVE,
      scheduleTier: row.bannerSchedule.tier,
      vipCreditEntryId: row.bannerSchedule.vipCreditEntryId,
      attempts: row.attempts,
      availableAt: row.availableAt,
      expiresAt: row.expiresAt,
    };
  }

  async loadAudience(
    event: PromoPushEventView,
    freshAfter: Date,
    allowlist: string[] | null,
  ): Promise<AudienceCandidate[]> {
    const rows = await this.prisma.user.findMany({
      where: promoAudienceWhere({
        ibgeCityId: event.ibgeCityId,
        freshAfter,
        venueId: event.venueId,
        allowlist,
      }),
      select: {
        id: true,
        role: true,
        promoNotificationsEnabled: true,
        ibgeCityId: true,
        lastAuthorizedIbgeCityId: true,
        lastAuthorizedCityAt: true,
        devicePushTokens: {
          where: { disabledAt: null },
          select: { id: true, token: true, disabledAt: true },
        },
        venueBlocks: {
          where: { venueId: event.venueId },
          select: { id: true },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      promoNotificationsEnabled: row.promoNotificationsEnabled,
      ibgeCityId: row.ibgeCityId,
      lastAuthorizedIbgeCityId: row.lastAuthorizedIbgeCityId,
      lastAuthorizedCityAt: row.lastAuthorizedCityAt,
      blocked: row.venueBlocks.length > 0,
      tokens: row.devicePushTokens,
    }));
  }

  async recentEventCounts(
    userIds: string[],
    since: Date,
    exceptEventId: string,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (!userIds.length) return counts;
    const rows = await this.prisma.promoPushDelivery.findMany({
      where: {
        userId: { in: userIds },
        eventId: { not: exceptEventId },
        OR: [
          { status: 'SENT', sentAt: { gte: since } },
          { status: 'CLAIMED', createdAt: { gte: since } },
        ],
      },
      select: { userId: true, eventId: true },
      distinct: ['userId', 'eventId'],
    });
    for (const row of rows) {
      counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1);
    }
    return counts;
  }

  async claimDeliveries(
    eventId: string,
    items: { tokenId: string; token: string; userId: string }[],
  ): Promise<DeliveryClaim[]> {
    if (!items.length) return [];
    const tokenIds = items.map((item) => item.tokenId);
    const existing = await this.prisma.promoPushDelivery.findMany({
      where: { eventId, tokenId: { in: tokenIds } },
      select: { tokenId: true },
    });
    const known = new Set(existing.map((row) => row.tokenId));
    const missing = items.filter((item) => !known.has(item.tokenId));
    if (missing.length) {
      await this.prisma.promoPushDelivery.createMany({
        data: missing.map((item) => ({
          eventId,
          tokenId: item.tokenId,
          userId: item.userId,
          status: 'CLAIMED' as const,
          attempts: 1,
        })),
        skipDuplicates: true,
      });
    }
    const refreshed = await this.prisma.promoPushDelivery.findMany({
      where: { eventId, tokenId: { in: tokenIds } },
      select: { tokenId: true, status: true },
    });
    const statusByToken = new Map(
      refreshed.map((row) => [row.tokenId, row.status]),
    );
    return items.map((item) => ({
      ...item,
      alreadySent: statusByToken.get(item.tokenId) === 'SENT',
    }));
  }

  async markDeliveries(
    updates: {
      eventId: string;
      tokenId: string;
      status: 'SENT' | 'INVALID' | 'CLAIMED';
      error: string | null;
      sentAt: Date | null;
    }[],
  ): Promise<void> {
    for (const update of updates) {
      await this.prisma.promoPushDelivery.updateMany({
        where: { eventId: update.eventId, tokenId: update.tokenId },
        data: {
          status: update.status,
          error: update.error,
          sentAt: update.sentAt,
        },
      });
    }
  }

  async disableToken(tokenId: string, now: Date): Promise<void> {
    await this.prisma.devicePushToken.updateMany({
      where: { id: tokenId },
      data: { disabledAt: now },
    });
  }

  async release(id: string, workerId: string, attempts: number): Promise<void> {
    await this.prisma.promoPushEvent.updateMany({
      where: { id, lockedBy: workerId, status: 'PROCESSING' },
      data: {
        status: 'PENDING',
        error: 'PROMO_PUSH_DISABLED',
        lockedUntil: null,
        lockedBy: null,
        attempts,
      },
    });
  }

  async finish(
    id: string,
    workerId: string,
    patch: PromoPushFinish,
  ): Promise<void> {
    await this.prisma.promoPushEvent.updateMany({
      where: { id, lockedBy: workerId },
      data: {
        status: patch.status,
        error: patch.error,
        lockedUntil: null,
        lockedBy: null,
        ...(patch.availableAt ? { availableAt: patch.availableAt } : {}),
        ...(patch.sentAt !== undefined ? { sentAt: patch.sentAt } : {}),
        ...(patch.targetedUsers !== undefined
          ? { targetedUsers: patch.targetedUsers }
          : {}),
        ...(patch.targetedTokens !== undefined
          ? { targetedTokens: patch.targetedTokens }
          : {}),
        ...(patch.sentCount !== undefined ? { sentCount: patch.sentCount } : {}),
        ...(patch.failedCount !== undefined
          ? { failedCount: patch.failedCount }
          : {}),
        ...(patch.skippedCount !== undefined
          ? { skippedCount: patch.skippedCount }
          : {}),
      },
    });
  }
}

export function isMissingPromoPushSchema(error: unknown): boolean {
  return (error as { code?: string }).code === 'P2021';
}

export const PROMO_PUSH_STORE = 'PROMO_PUSH_STORE';
