export function parseAudienceList(...values: Array<string | undefined>): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const part of value.split(',')) {
      const trimmed = part.trim();
      if (trimmed) ids.add(trimmed);
    }
  }
  return [...ids];
}

export function isAllowedOAuthRedirect(
  redirect: string,
  extraOrigins: string[] = [],
): boolean {
  let url: URL;
  try {
    url = new URL(redirect);
  } catch {
    return false;
  }

  if (url.protocol === 'after:') {
    return url.host === 'auth' || url.pathname.startsWith('/auth');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') {
    return true;
  }

  return extraOrigins.some((origin) => origin === url.origin);
}

export function attachOAuthToken(redirect: string, token: string): string {
  if (redirect.startsWith('after:')) {
    const url = new URL(redirect);
    url.searchParams.set('token', token);
    return url.toString();
  }

  const url = new URL(redirect);
  url.hash = `/oauth?token=${encodeURIComponent(token)}`;
  return url.toString();
}
