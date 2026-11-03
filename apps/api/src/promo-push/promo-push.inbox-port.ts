import type { PromoContentKind } from './promo-push.copy';

export const PROMO_PUSH_INBOX = Symbol('PROMO_PUSH_INBOX');

export type PromoPushInboxPort = {
  persistVipPromoInbox(params: {
    promoPushEventId: string;
    venueId: string;
    bannerId: string;
    venueName: string;
    contentKind: PromoContentKind;
    bannerTitle: string | null;
    bannerDescription: string | null;
    userIds: string[];
  }): Promise<void>;
};
