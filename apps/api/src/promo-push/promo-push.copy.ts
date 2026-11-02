export type PromoContentKind = 'PROMOTION' | 'EVENT' | null;

export const PROMO_PUSH_BODY_FALLBACK =
  'Confira o que está rolando na sua cidade. Toque para ver!';

/**
 * FCM accepts long notification bodies; Android and iOS may truncate what they
 * show in the shade. We send the banner description verbatim (UTF-8, newlines).
 * Each data value must stay under 4KB; the body lives in `notification`, not data.
 */
export const PROMO_PUSH_FCM_BODY_MAX = 4096;

export function promoPushBody(description: string | null | undefined): string {
  const trimmed = description?.trim() ?? '';
  if (!trimmed) return PROMO_PUSH_BODY_FALLBACK;
  if (trimmed.length <= PROMO_PUSH_FCM_BODY_MAX) return trimmed;
  return `${trimmed.slice(0, PROMO_PUSH_FCM_BODY_MAX - 1)}…`;
}

function promoPushTitleFallback(
  venueName: string,
  contentKind: PromoContentKind,
): string {
  const name = venueName.trim() || 'Um estabelecimento';
  const kind =
    contentKind === 'PROMOTION'
      ? 'uma promoção'
      : contentKind === 'EVENT'
        ? 'um evento'
        : 'uma novidade';
  return `${name} publicou ${kind} para hoje!`;
}

/** `{venue} publicou {banner.title}`; generic kind-based title when banner title is missing. */
export function promoPushTitle(
  venueName: string,
  contentKind: PromoContentKind,
  bannerTitle?: string | null,
): string {
  const trimmed = bannerTitle?.trim() ?? '';
  if (trimmed) {
    const name = venueName.trim() || 'Um estabelecimento';
    return `${name} publicou ${trimmed}`;
  }
  return promoPushTitleFallback(venueName, contentKind);
}

export function promoPushCopy(
  venueName: string,
  contentKind: PromoContentKind,
  bannerTitle?: string | null,
  description?: string | null,
): { title: string; body: string } {
  return {
    title: promoPushTitle(venueName, contentKind, bannerTitle),
    body: promoPushBody(description),
  };
}

/** Collapse ids must stay short and stable for the same event. */
export function fcmCollapseKey(eventId: string): string {
  const cleaned = eventId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return cleaned || 'promo';
}
