import { Injectable, Logger } from '@nestjs/common';
import {
  APP_STORE_REVIEW_MAX_EMAIL_ATTEMPTS,
  appStoreReviewAppleAppId,
  appStoreReviewNotifyTo,
  appStoreReviewPollMs,
  type AppStoreReviewEnv,
} from './app-store-review.config';
import { createAppStoreReviewConnectJwt, appStoreReviewAscCredentialSource } from './app-store-review-connect-jwt';
import {
  fetchAllAppStoreCustomerReviews,
  type AscCustomerReview,
  type AscReviewsFetchResult,
} from './app-store-connect-reviews.client';
import { sendAppStoreReviewNotificationEmail } from './app-store-review-mail';
import { AppStoreReviewStore } from './app-store-review.store';

export type AppStoreReviewTickResult = {
  skipped?: string;
  fetched?: number;
  baseline?: boolean;
  baselineRegistered?: number;
  newQueued?: number;
  emailsSent?: number;
  emailsFailed?: number;
  nextPollAt?: string;
  error?: string;
};

@Injectable()
export class AppStoreReviewSyncService {
  private readonly logger = new Logger(AppStoreReviewSyncService.name);
  private env: AppStoreReviewEnv = process.env;

  constructor(private readonly store: AppStoreReviewStore) {}

  useEnv(env: AppStoreReviewEnv): this {
    this.env = env;
    return this;
  }

  async runTick(now = new Date()): Promise<AppStoreReviewTickResult> {
    const appAppleId = appStoreReviewAppleAppId(this.env);
    const notifyTo = appStoreReviewNotifyTo(this.env);
    const pollMs = appStoreReviewPollMs(this.env);
    const nextPollAt = new Date(now.getTime() + pollMs);

    await this.store.ensureSyncState(appAppleId);
    await this.store.markPollStart(now);

    const credSource = appStoreReviewAscCredentialSource(this.env);
    const asc = await fetchAllAppStoreCustomerReviews(appAppleId, {
      env: this.env,
      jwtFactory: () => createAppStoreReviewConnectJwt(this.env),
    });
    if (!asc.ok) {
      await this.store.markPollError(asc.message);
      const req = 'requestId' in asc && asc.requestId ? ` requestId=${asc.requestId}` : '';
      this.logger.warn(
        `app-store-reviews asc error cred=${credSource} code=${asc.code}${req} ${asc.message}`,
      );
      return { error: asc.message };
    }

    const reviews = asc.reviews;
    const state = await this.store.getSyncState();
    const inBaseline = !state?.baselineCompletedAt;

    let newQueued = 0;
    let baselineRegistered = 0;

    // Baseline só após paginação completa sem erro (fetchAll ok).
    if (inBaseline) {
      baselineRegistered = await this.store.upsertBaselineBatch(
        appAppleId,
        reviews,
      );
      await this.store.completeBaseline(now, appAppleId);
      await this.store.markPollSuccess(now, nextPollAt);
      this.logger.log(
        [
          'app-store-reviews baseline',
          `fetched=${reviews.length}`,
          `registered=${baselineRegistered}`,
          `nextPollAt=${nextPollAt.toISOString()}`,
        ].join(' '),
      );
      return {
        fetched: reviews.length,
        baseline: true,
        baselineRegistered,
        nextPollAt: nextPollAt.toISOString(),
      };
    }

    const queuedIds = await this.store.registerNewReviews(appAppleId, reviews);
    newQueued = queuedIds.length;

    let emailsSent = 0;
    let emailsFailed = 0;

    const deliveryIds = await this.store.listPendingDeliveryIds(100);
    for (const reviewId of deliveryIds) {
      const row = await this.store.loadReview(reviewId);
      if (!row) continue;
      if (row.emailAttempts >= APP_STORE_REVIEW_MAX_EMAIL_ATTEMPTS) {
        continue;
      }
      const attempt = await this.store.incrementAttempt(reviewId);
      const review: AscCustomerReview = {
        id: row.reviewId,
        rating: row.rating,
        title: row.title,
        body: row.body,
        reviewerNickname: row.reviewerNickname,
        territory: row.territory,
        createdAt: row.reviewCreatedAt,
      };
      const mail = await sendAppStoreReviewNotificationEmail({
        to: notifyTo,
        review,
        appAppleId,
      });
      if (mail.ok) {
        await this.store.markEmailSent(reviewId, now);
        emailsSent += 1;
      } else {
        await this.store.markEmailFailed(reviewId, mail.message, attempt);
        emailsFailed += 1;
        this.logger.warn(
          `app-store-reviews mail fail reviewId=${reviewId} attempt=${attempt} ${mail.message}`,
        );
        if (mail.code === 'RESEND_CONFIG') {
          await this.store.markPollError(mail.message);
          return {
            fetched: reviews.length,
            newQueued,
            emailsSent,
            emailsFailed,
            error: mail.message,
            nextPollAt: nextPollAt.toISOString(),
          };
        }
      }
    }

    await this.store.markPollSuccess(now, nextPollAt);
    this.logger.log(
      [
        'app-store-reviews tick',
        `fetched=${reviews.length}`,
        `newQueued=${newQueued}`,
        `emailsSent=${emailsSent}`,
        `emailsFailed=${emailsFailed}`,
        `nextPollAt=${nextPollAt.toISOString()}`,
      ].join(' '),
    );

    return {
      fetched: reviews.length,
      newQueued,
      emailsSent,
      emailsFailed,
      nextPollAt: nextPollAt.toISOString(),
    };
  }

  async probeAsc(): Promise<AscReviewsFetchResult> {
    const appAppleId = appStoreReviewAppleAppId(this.env);
    return fetchAllAppStoreCustomerReviews(appAppleId, {
      env: this.env,
      jwtFactory: () => createAppStoreReviewConnectJwt(this.env),
    });
  }
}