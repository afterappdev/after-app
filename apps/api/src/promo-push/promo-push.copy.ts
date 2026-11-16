import {
  PROMO_PUBLICATION_DESCRIPTION_MAX,
  PROMO_PUBLICATION_TITLE_MAX,
} from './promo-push.limits';

export type PromoContentKind = 'PROMOTION' | 'EVENT' | null;

export const PROMO_PUSH_BODY_FALLBACK =
  'Confira o que está rolando na sua cidade. Toque para ver!';

/** Hard ceiling for FCM transport; UI limits are much lower. */
export const PROMO_PUSH_FCM_BODY_MAX = 4096;

export function promoPushBody(description: string | null | undefined): string {
  const trimmed = description?.trim() ?? '';
  if (!trimmed) return PROMO_PUSH_BODY_FALLBACK;
  if (trimmed.length <= PROMO_PUBLICATION_DESCRIPTION_MAX) return trimmed;
  return trimmed.slice(0, PROMO_PUBLICATION_DESCRIPTION_MAX);
}

function promoPushTitleFallback(contentKind: PromoContentKind): string {
  if (contentKind === 'PROMOTION') return 'Promoção do dia';
  if (contentKind === 'EVENT') return 'Evento do dia';
  return 'Novidade do dia';
}

/** Push title = banner title only (After icon comes from the app, venue logo from imageUrl). */
export function promoPushTitle(
  contentKind: PromoContentKind,
  bannerTitle?: string | null,
): string {
  const trimmed = bannerTitle?.trim() ?? '';
  if (trimmed) {
    return trimmed.length <= PROMO_PUBLICATION_TITLE_MAX
      ? trimmed
      : trimmed.slice(0, PROMO_PUBLICATION_TITLE_MAX);
  }
  return promoPushTitleFallback(contentKind);
}

export function promoPushCopy(
  _venueName: string,
  contentKind: PromoContentKind,
  bannerTitle?: string | null,
  description?: string | null,
): { title: string; body: string } {
  return {
    title: promoPushTitle(contentKind, bannerTitle),
    body: promoPushBody(description),
  };
}

/** Collapse ids must stay short and stable for the same event. */
export function fcmCollapseKey(eventId: string): string {
  const cleaned = eventId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return cleaned || 'promo';
}
