import { Injectable } from '@nestjs/common';
import { AppStoreReviewEmailStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { APP_STORE_REVIEW_LOCK_MS } from './app-store-review.config';
import type { AscCustomerReview } from './app-store-connect-reviews.client';

export function isMissingAppStoreReviewSchema(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  if (code === 'P2021') return true;
  const message = String((error as Error)?.message ?? '');
  return (
    message.includes('AppStoreReviewNotification') ||
    message.includes('AppStoreReviewSyncState') ||
    message.includes('AppStoreReviewWorkerLock')
  );
}

@Injectable()
export class AppStoreReviewStore {
  constructor(private readonly prisma: PrismaService) {}

  async acquireLock(
    workerId: string,
    now: Date,
    leaseMs = APP_STORE_REVIEW_LOCK_MS,
  ): Promise<boolean> {
    const lockedUntil = new Date(now.getTime() + leaseMs);
    const updated = await this.prisma.appStoreReviewWorkerLock.updateMany({
      where: { id: 1, lockedUntil: { lt: now } },
      data: { lockedUntil, lockedBy: workerId },
    });
    if (updated.count === 1) return true;
    try {
      await this.prisma.appStoreReviewWorkerLock.create({
        data: { id: 1, lockedUntil, lockedBy: workerId },
      });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }

  async releaseLock(workerId: string, now: Date): Promise<void> {
    await this.prisma.appStoreReviewWorkerLock.updateMany({
      where: { id: 1, lockedBy: workerId },
      data: { lockedUntil: now },
    });
  }

  async ensureSyncState(appAppleId: string): Promise<void> {
    await this.prisma.appStoreReviewSyncState.upsert({
      where: { id: 1 },
      create: { id: 1, appAppleId },
      update: { appAppleId },
    });
  }

  async getSyncState() {
    return this.prisma.appStoreReviewSyncState.findUnique({ where: { id: 1 } });
  }

  async markPollStart(now: Date): Promise<void> {
    await this.prisma.appStoreReviewSyncState.update({
      where: { id: 1 },
      data: { lastPollStartedAt: now, lastError: null },
    });
  }

  async markPollSuccess(now: Date, nextPollAt: Date): Promise<void> {
    await this.prisma.appStoreReviewSyncState.update({
      where: { id: 1 },
      data: {
        lastPollFinishedAt: now,
        lastSuccessAt: now,
        nextScheduledPollAt: nextPollAt,
        lastError: null,
      },
    });
  }

  async markPollError(error: string): Promise<void> {
    await this.prisma.appStoreReviewSyncState.update({
      where: { id: 1 },
      data: {
        lastPollFinishedAt: new Date(),
        lastError: error.slice(0, 500),
      },
    });
  }

  async completeBaseline(now: Date, appAppleId: string): Promise<void> {
    await this.prisma.appStoreReviewSyncState.update({
      where: { id: 1 },
      data: { baselineCompletedAt: now, appAppleId },
    });
  }

  async upsertBaselineBatch(
    appAppleId: string,
    reviews: AscCustomerReview[],
  ): Promise<number> {
    if (reviews.length === 0) return 0;
    let created = 0;
    for (const review of reviews) {
      const result = await this.prisma.appStoreReviewNotification.createMany({
        data: [
          {
            reviewId: review.id,
            appAppleId,
            rating: review.rating,
            title: review.title,
            body: review.body,
            reviewerNickname: review.reviewerNickname,
            territory: review.territory,
            reviewCreatedAt: review.createdAt,
            status: AppStoreReviewEmailStatus.BASELINE,
          },
        ],
        skipDuplicates: true,
      });
      created += result.count;
    }
    return created;
  }

  async registerNewReviews(
    appAppleId: string,
    reviews: AscCustomerReview[],
  ): Promise<string[]> {
    const pending: string[] = [];
    for (const review of reviews) {
      const existing = await this.prisma.appStoreReviewNotification.findUnique({
        where: { reviewId: review.id },
        select: { reviewId: true, status: true },
      });
      if (!existing) {
        await this.prisma.appStoreReviewNotification.create({
          data: {
            reviewId: review.id,
            appAppleId,
            rating: review.rating,
            title: review.title,
            body: review.body,
            reviewerNickname: review.reviewerNickname,
            territory: review.territory,
            reviewCreatedAt: review.createdAt,
            status: AppStoreReviewEmailStatus.PENDING,
          },
        });
        pending.push(review.id);
        continue;
      }
      await this.prisma.appStoreReviewNotification.update({
        where: { reviewId: review.id },
        data: {
          rating: review.rating,
          title: review.title,
          body: review.body,
          reviewerNickname: review.reviewerNickname,
          territory: review.territory,
          reviewCreatedAt: review.createdAt,
        },
      });
      if (
        existing.status === AppStoreReviewEmailStatus.PENDING ||
        existing.status === AppStoreReviewEmailStatus.FAILED
      ) {
        pending.push(review.id);
      }
    }
    return pending;
  }

  async listPendingDeliveryIds(limit = 50): Promise<string[]> {
    const rows = await this.prisma.appStoreReviewNotification.findMany({
      where: {
        status: {
          in: [
            AppStoreReviewEmailStatus.PENDING,
            AppStoreReviewEmailStatus.FAILED,
          ],
        },
      },
      orderBy: { reviewCreatedAt: 'asc' },
      take: limit,
      select: { reviewId: true },
    });
    return rows.map((r) => r.reviewId);
  }

  async loadReview(reviewId: string) {
    return this.prisma.appStoreReviewNotification.findUnique({
      where: { reviewId },
    });
  }

  async markEmailSent(reviewId: string, sentAt: Date): Promise<void> {
    await this.prisma.appStoreReviewNotification.update({
      where: { reviewId },
      data: {
        status: AppStoreReviewEmailStatus.SENT,
        emailSentAt: sentAt,
        lastEmailError: null,
      },
    });
  }

  async markEmailFailed(
    reviewId: string,
    message: string,
    attempts: number,
  ): Promise<void> {
    await this.prisma.appStoreReviewNotification.update({
      where: { reviewId },
      data: {
        status: AppStoreReviewEmailStatus.FAILED,
        lastEmailError: message.slice(0, 500),
        emailAttempts: attempts,
      },
    });
  }

  async incrementAttempt(reviewId: string): Promise<number> {
    const row = await this.prisma.appStoreReviewNotification.update({
      where: { reviewId },
      data: { emailAttempts: { increment: 1 } },
      select: { emailAttempts: true },
    });
    return row.emailAttempts;
  }
}