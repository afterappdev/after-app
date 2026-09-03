import { Inject, Injectable, Logger } from '@nestjs/common';
import { AdminPushEventType, CreditPurchase, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  accountCreatedCopy,
  purchasePaidCopy,
  safePushErrorMessage,
  venueCreatedCopy,
  isRealPaidSale,
} from './admin-push.copy';
import {
  FIREBASE_MESSAGING_PORT,
  type AdminPushPayload,
  type FirebaseMessagingPort,
} from './firebase-messaging.port';

const RETRY_DELAY_MS = 400;

type AccountCreatedInput = {
  id: string;
  name: string;
  role: Role;
  venue?: { id: string; name: string } | null;
};

@Injectable()
export class AdminPushService {
  private readonly logger = new Logger(AdminPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FIREBASE_MESSAGING_PORT)
    private readonly messaging: FirebaseMessagingPort,
  ) {}

  async notifyConsumerAccountCreated(user: AccountCreatedInput): Promise<void> {
    try {
      if (user.role !== Role.USER && user.role !== Role.VENUE) return;

      await this.dispatch({
        type: AdminPushEventType.ACCOUNT_CREATED,
        entityId: user.id,
        payload: {
          ...accountCreatedCopy(user.role, user.name),
          data: {
            type: AdminPushEventType.ACCOUNT_CREATED,
            entityId: user.id,
          },
        },
      });

      if (user.role === Role.VENUE && user.venue?.id) {
        await this.dispatch({
          type: AdminPushEventType.VENUE_CREATED,
          entityId: user.venue.id,
          payload: {
            ...venueCreatedCopy(user.venue.name),
            data: {
              type: AdminPushEventType.VENUE_CREATED,
              entityId: user.venue.id,
              accountId: user.id,
            },
          },
        });
      }
    } catch (error) {
      safePushErrorMessage(error, this.logger);
    }
  }

  async notifyPurchasePaid(purchase: CreditPurchase): Promise<void> {
    try {
      if (!isRealPaidSale(purchase)) return;
      const copy = purchasePaidCopy({
        credits: purchase.credits,
        amountPaid: purchase.amountPaid,
        provider: purchase.provider,
      });
      await this.dispatch({
        type: AdminPushEventType.PURCHASE_PAID,
        entityId: purchase.id,
        payload: {
          ...copy,
          data: {
            type: AdminPushEventType.PURCHASE_PAID,
            entityId: purchase.id,
          },
        },
      });
    } catch (error) {
      safePushErrorMessage(error, this.logger);
    }
  }

  private async dispatch(input: {
    type: AdminPushEventType;
    entityId: string;
    payload: AdminPushPayload;
  }): Promise<void> {
    const claimed = await this.claimEvent(input.type, input.entityId);
    if (!claimed) return;

    try {
      await this.deliver(claimed.id, input.payload);
    } catch (error) {
      await this.markError(
        claimed.id,
        safePushErrorMessage(error, this.logger),
      );
    }
  }

  private async claimEvent(type: AdminPushEventType, entityId: string) {
    try {
      return await this.prisma.adminPushEvent.create({
        data: { type, entityId },
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        return null;
      }
      throw error;
    }
  }

  private async deliver(eventId: string, payload: AdminPushPayload) {
    if (!this.messaging.configured) {
      await this.markError(eventId, 'FCM_NOT_CONFIGURED');
      return;
    }

    const devices = await this.prisma.adminDeviceToken.findMany({
      select: { token: true },
    });
    if (devices.length === 0) {
      await this.prisma.adminPushEvent.update({
        where: { id: eventId },
        data: { sentAt: new Date(), error: null },
      });
      return;
    }

    const tokens = devices.map((item) => item.token);
    let results = await this.messaging.sendToTokens(tokens, payload);
    const retryable = results.filter((item) => !item.success && !item.invalid);
    if (retryable.length > 0) {
      await sleep(RETRY_DELAY_MS);
      const retried = await this.messaging.sendToTokens(
        retryable.map((item) => item.token),
        payload,
      );
      const byToken = new Map(results.map((item) => [item.token, item]));
      for (const item of retried) {
        byToken.set(item.token, item);
      }
      results = [...byToken.values()];
    }

    const invalid = results
      .filter((item) => item.invalid)
      .map((item) => item.token);
    if (invalid.length > 0) {
      await this.prisma.adminDeviceToken.deleteMany({
        where: { token: { in: invalid } },
      });
    }

    const failed = results.filter((item) => !item.success && !item.invalid);
    await this.prisma.adminPushEvent.update({
      where: { id: eventId },
      data: {
        sentAt: new Date(),
        error: failed.length > 0 ? 'FCM_PARTIAL_FAILURE' : null,
      },
    });
  }

  private async markError(eventId: string, error: string) {
    await this.prisma.adminPushEvent.update({
      where: { id: eventId },
      data: { error },
    });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
