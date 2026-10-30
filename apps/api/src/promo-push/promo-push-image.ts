const MAX_PUSH_IMAGE_URL_LENGTH = 2048;

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;

/** HTTPS logo URL for FCM. No download — format and scheme only. */
export function resolveVipPushLogoUrl(
  raw: string | null | undefined,
): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.length > MAX_PUSH_IMAGE_URL_LENGTH) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:') return undefined;
  if (parsed.username || parsed.password) return undefined;
  const path = parsed.pathname;
  if (!path || path === '/') return undefined;
  if (IMAGE_EXT.test(path)) return trimmed;
  if (/\/uploads\//i.test(path)) return trimmed;
  return undefined;
}
