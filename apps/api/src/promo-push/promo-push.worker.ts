import { Inject, Injectable } from '@nestjs/common';
import {
  FIREBASE_MESSAGING_PORT,
  type FirebaseMessagingPort,
} from '../admin/push/firebase-messaging.port';
import { AudienceCandidate, selectPromoAudience } from './promo-push.audience';
import {
  promoPushCapWindowStart,
  promoPushLocationMaxAgeMs,
  promoPushMaxPerUserPerDay,
  PromoPushMode,
  resolvePromoPushMode,
} from './promo-push.config';
import { fcmCollapseKey, vipPushCopy } from './promo-push.copy';
import { resolveVipPushLogoUrl } from './promo-push-image';
import {
  chunkList,
  formatPromoPushLog,
  FCM_MULTICAST_LIMIT,
  nextPromoPushAttempt,
  PROMO_PUSH_LOCK_MS,
  PROMO_PUSH_MAX_ATTEMPTS,
} from './promo-push.retry';
import {
  PROMO_PUSH_STORE,
  type PromoPushEventView,
  type PromoPushFinish,
  type PromoPushStore,
} from './promo-push.store';

/**
 * FCM does not offer a producer-side exactly-once guarantee. A crash after the
 * provider accepts a message and before we mark the delivery SENT can send that
 * device again. The delivery row and the collapse key (event id) keep that
 * window small: a later copy replaces an undismissed notification on Android,
 * APNs and Web Push when the platform honors the collapse id. Our table still
 * refuses a second SENT row for the same event and token. FCM itself does not
 * guarantee exactly-once delivery.
 *
 * Turning the flag off after a claim and before the provider call releases the
 * event without sending. A mode change never widens an allowlist into public.
 */
@Injectable()
export class PromoPushWorker {
  private log: (line: string) => void = () => undefined;
  private env: NodeJS.ProcessEnv = { PROMO_PUSH_ENABLED: 'false' };
  workerId = `promo-${process.pid}`;

  constructor(
    @Inject(PROMO_PUSH_STORE) private readonly store: PromoPushStore,
    @Inject(FIREBASE_MESSAGING_PORT)
    private readonly messaging: FirebaseMessagingPort,
  ) {}

  useLogger(log: (line: string) => void): this {
    this.log = log;
    return this;
  }

  useEnv(env: NodeJS.ProcessEnv): this {
    this.env = env;
    return this;
  }

  useWorkerId(workerId: string): this {
    this.workerId = workerId;
    return this;
  }

  async dispatchDue(
    now: Date,
    mode: Exclude<PromoPushMode, { kind: 'off' }>,
  ): Promise<void> {
    const resolved = resolvePromoPushMode(this.env);
    if (resolved.kind === 'off') return;
    const effective = resolved.kind === 'allowlist' ? resolved : mode;
    const ids = await this.store.listReadyIds(now, 20);
    for (const id of ids) {
      if (resolvePromoPushMode(this.env).kind === 'off') return;
      await this.processOne(id, now, effective);
    }
  }

  private liveMode(
    started: Exclude<PromoPushMode, { kind: 'off' }>,
  ): PromoPushMode {
    const resolved = resolvePromoPushMode(this.env);
    if (resolved.kind === 'off' || resolved.kind === 'allowlist') return resolved;
    return started.kind === 'allowlist' ? started : resolved;
  }

  private async pause(
    event: PromoPushEventView,
    restoreAttempt: boolean,
  ): Promise<void> {
    const attempts = restoreAttempt
      ? Math.max(0, event.attempts - 1)
      : event.attempts;
    await this.store.release(event.id, this.workerId, attempts);
    this.log(formatPromoPushLog(event.id, 'paused'));
  }

  async processOne(
    id: string,
    now: Date,
    mode: Exclude<PromoPushMode, { kind: 'off' }>,
  ): Promise<void> {
    const claimed = await this.store.claim(
      id,
      this.workerId,
      now,
      PROMO_PUSH_LOCK_MS,
    );
    if (!claimed) return;
    const event = await this.store.load(id);
    if (!event) return;

    const blocked = this.terminalReason(event, now);
    if (blocked) {
      await this.store.finish(id, this.workerId, blocked);
      this.log(formatPromoPushLog(id, 'skipped'));
      return;
    }
    if (event.attempts > PROMO_PUSH_MAX_ATTEMPTS) {
      await this.store.finish(id, this.workerId, {
        status: 'FAILED',
        error: 'FCM_MAX_ATTEMPTS',
      });
      this.log(formatPromoPushLog(id, 'failed', { attempt: event.attempts }));
      return;
    }

    const gated = this.liveMode(mode);
    if (gated.kind === 'off') {
      await this.pause(event, true);
      return;
    }

    const maxAge = promoPushLocationMaxAgeMs(this.env);
    const allowlist = gated.kind === 'allowlist' ? gated.userIds : null;
    const candidates = await this.store.loadAudience(
      event,
      new Date(now.getTime() - maxAge),
      allowlist,
    );
    const audience = selectPromoAudience({
      candidates,
      ibgeCityId: event.ibgeCityId,
      now,
      locationMaxAgeMs: maxAge,
      maxPerDay: promoPushMaxPerUserPerDay(this.env),
      recentEventCounts: await this.store.recentEventCounts(
        candidates.map((candidate) => candidate.id),
        promoPushCapWindowStart(now),
        event.id,
      ),
    });
    let tokens = dedupeTokens(audience.selected);
    const beforeSend = this.liveMode(mode);
    if (beforeSend.kind === 'off') {
      await this.pause(event, true);
      return;
    }
    if (beforeSend.kind === 'allowlist') {
      const allowed = new Set(beforeSend.userIds);
      tokens = tokens.filter((item) => allowed.has(item.userId));
    }
    if (!tokens.length) {
      await this.store.finish(id, this.workerId, {
        status: 'SENT',
        error: null,
        sentAt: now,
        targetedUsers: 0,
        targetedTokens: 0,
        sentCount: 0,
        failedCount: 0,
        skippedCount: audience.skippedByCap.length,
      });
      this.log(
        formatPromoPushLog(id, 'empty', {
          skipped: audience.skippedByCap.length,
        }),
      );
      return;
    }

    const claimedDeliveries = await this.store.claimDeliveries(event.id, tokens);
    const pending = claimedDeliveries.filter((item) => !item.alreadySent);
    if (!pending.length) {
      await this.finishSent(event, now, tokens.length, 0, 0, audience.skippedByCap.length);
      return;
    }

    const copy = vipPushCopy(event.venueName, event.bannerTitle);
    const logoUrl = resolveVipPushLogoUrl(event.venueLogoUrl);
    const message = {
      title: copy.title,
      body: copy.body,
      collapseKey: fcmCollapseKey(event.id),
      androidChannelId: 'promo_alerts',
      imageUrl: logoUrl,
      data: {
        type: 'PROMO_PUBLISHED',
        eventId: event.id,
        bannerId: event.bannerId,
        venueId: event.venueId,
        scheduleId: event.scheduleId,
        ...(logoUrl ? { imageUrl: logoUrl } : {}),
      },
    };

    let sent = 0;
    let invalid = 0;
    let failed = 0;
    for (const part of chunkList(pending, FCM_MULTICAST_LIMIT)) {
      if (this.liveMode(mode).kind === 'off') {
        await this.pause(event, false);
        return;
      }
      const revoked = await this.freshBlock(id, now);
      if (revoked) {
        await this.store.finish(id, this.workerId, {
          ...revoked,
          sentCount: sent,
          failedCount: failed,
        });
        this.log(formatPromoPushLog(id, 'skipped', { sent, failed }));
        return;
      }
      let results: { success: boolean; invalid: boolean }[];
      try {
        results = await this.messaging.sendToTokens(
          part.map((item) => item.token),
          message,
        );
      } catch {
        failed += part.length;
        break;
      }
      const updates: {
        eventId: string;
        tokenId: string;
        status: 'SENT' | 'INVALID' | 'CLAIMED';
        error: string | null;
        sentAt: Date | null;
      }[] = [];
      part.forEach((item, index) => {
        const result = results[index];
        if (result?.success) {
          sent += 1;
          updates.push({
            eventId: event.id,
            tokenId: item.tokenId,
            status: 'SENT',
            error: null,
            sentAt: now,
          });
          return;
        }
        if (result?.invalid) {
          invalid += 1;
          updates.push({
            eventId: event.id,
            tokenId: item.tokenId,
            status: 'INVALID',
            error: 'FCM_INVALID_TOKEN',
            sentAt: null,
          });
          return;
        }
        failed += 1;
      });
      if (updates.length) await this.store.markDeliveries(updates);
      for (const update of updates) {
        if (update.status === 'INVALID') {
          await this.store.disableToken(update.tokenId, now);
        }
      }
      if (failed > 0) break;
    }

    if (failed > 0) {
      if (event.attempts >= PROMO_PUSH_MAX_ATTEMPTS) {
        await this.store.finish(id, this.workerId, {
          status: 'FAILED',
          error: 'FCM_TEMPORARY',
          targetedUsers: audience.selected.length,
          targetedTokens: tokens.length,
          sentCount: sent,
          failedCount: failed,
          skippedCount: audience.skippedByCap.length,
        });
        this.log(formatPromoPushLog(id, 'failed', { sent, failed, invalid }));
        return;
      }
      const next = nextPromoPushAttempt(now, event.attempts);
      if (next.getTime() >= event.expiresAt.getTime()) {
        await this.store.finish(id, this.workerId, {
          status: 'SKIPPED',
          error: 'WINDOW_CLOSED',
          sentCount: sent,
          failedCount: failed,
        });
        this.log(formatPromoPushLog(id, 'skipped', { sent, failed }));
        return;
      }
      await this.store.finish(id, this.workerId, {
        status: 'PENDING',
        error: 'FCM_TEMPORARY',
        availableAt: next,
        targetedUsers: audience.selected.length,
        targetedTokens: tokens.length,
        sentCount: sent,
        failedCount: failed,
        skippedCount: audience.skippedByCap.length,
      });
      this.log(
        formatPromoPushLog(id, 'retry', {
          sent,
          failed,
          invalid,
          attempt: event.attempts,
        }),
      );
      return;
    }

    await this.finishSent(
      event,
      now,
      tokens.length,
      sent,
      invalid,
      audience.skippedByCap.length,
    );
  }

  /** Reloads the schedule immediately before FCM. A revoked VIP day stops the batch still unsent. */
  private async freshBlock(id: string, now: Date): Promise<PromoPushFinish | null> {
    const fresh = await this.store.load(id);
    if (!fresh) return { status: 'SKIPPED', error: 'VIP_RIGHT_INVALID' };
    return this.terminalReason(fresh, now);
  }

  private terminalReason(
    event: PromoPushEventView,
    now: Date,
  ): PromoPushFinish | null {
    if (event.expiresAt.getTime() <= now.getTime()) {
      return { status: 'SKIPPED', error: 'WINDOW_CLOSED' };
    }
    if (event.bannerStatus === 'CANCELLED') {
      return { status: 'SKIPPED', error: 'BANNER_CANCELLED' };
    }
    if (event.bannerStatus !== 'ACTIVE') {
      return { status: 'SKIPPED', error: 'BANNER_NOT_ACTIVE' };
    }
    if (event.venueHidden) {
      return { status: 'SKIPPED', error: 'VENUE_HIDDEN' };
    }
    if (event.scheduleTier !== 'VIP') {
      return { status: 'SKIPPED', error: 'NOT_VIP' };
    }
    if (!event.vipCreditEntryId) {
      return { status: 'SKIPPED', error: 'VIP_RIGHT_INVALID' };
    }
    return null;
  }

  private async finishSent(
    event: PromoPushEventView,
    now: Date,
    targetedTokens: number,
    sent: number,
    invalid: number,
    skipped: number,
  ) {
    await this.store.finish(event.id, this.workerId, {
      status: 'SENT',
      error: null,
      sentAt: now,
      targetedTokens,
      sentCount: sent,
      failedCount: 0,
      skippedCount: skipped + invalid,
    });
    this.log(
      formatPromoPushLog(event.id, 'sent', { sent, invalid, skipped }),
    );
  }
}

function dedupeTokens(selected: AudienceCandidate[]) {
  const seen = new Set<string>();
  const tokens: { tokenId: string; token: string; userId: string }[] = [];
  for (const user of selected) {
    for (const token of user.tokens) {
      if (token.disabledAt) continue;
      if (seen.has(token.token)) continue;
      seen.add(token.token);
      tokens.push({ tokenId: token.id, token: token.token, userId: user.id });
    }
  }
  return tokens;
}
