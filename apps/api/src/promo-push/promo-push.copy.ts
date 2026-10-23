export type PromoContentKind = 'PROMOTION' | 'EVENT' | null;

/**
 * Temporary classification.
 * Banner.contentKind is optional. The current app does not send it, so new
 * rows stay null. PROMOTION and EVENT are used only when that value was stored
 * explicitly. Without it, the title says "novidade" and never "promoção" or
 * "evento". The home-screen discount regex is intentionally ignored: it would
 * assert a promotion from an uncertain title.
 */
export function promoPushCopy(
  venueName: string,
  contentKind: PromoContentKind,
): { title: string; body: string } {
  const name = venueName.trim() || 'Um estabelecimento';
  const kind =
    contentKind === 'PROMOTION'
      ? 'uma promoção'
      : contentKind === 'EVENT'
        ? 'um evento'
        : 'uma novidade';
  return {
    title: `${name} publicou ${kind} para hoje!`,
    body: 'Confira o que está rolando na sua cidade. Toque para ver!',
  };
}

/** Collapse ids must stay short and stable for the same event. */
export function fcmCollapseKey(eventId: string): string {
  const cleaned = eventId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return cleaned || 'promo';
}
