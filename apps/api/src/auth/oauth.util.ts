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

export function parseAllowedRedirectOrigins(
  ...values: Array<string | undefined>
): string[] {
  const origins = new Set<string>();
  for (const raw of parseAudienceList(...values)) {
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        origins.add(url.origin);
      }
    } catch {
      // ignore entradas inválidas da allowlist
    }
  }
  return [...origins];
}

export function isAllowedOAuthRedirect(
  redirect: string,
  extraOrigins: string[] = [],
  options: { production?: boolean } = {},
): boolean {
  if (!redirect || /\s/.test(redirect)) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(redirect);
  } catch {
    return false;
  }

  if (url.username || url.password) {
    return false;
  }

  if (url.protocol === 'after:') {
    return url.host === 'auth' || url.pathname.startsWith('/auth');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  const production = Boolean(options.production);
  if (production && url.protocol !== 'https:') {
    return false;
  }

  const host = url.hostname.toLowerCase();
  if (production && (host === 'workers.dev' || host.endsWith('.workers.dev'))) {
    return false;
  }

  return extraOrigins.includes(url.origin);
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

export function attachOAuthOnboarding(
  redirect: string,
  onboardingToken: string,
): string {
  if (redirect.startsWith('after:')) {
    const url = new URL(redirect);
    url.searchParams.set('onboarding', onboardingToken);
    return url.toString();
  }

  const url = new URL(redirect);
  url.hash = `/register?onboarding=${encodeURIComponent(onboardingToken)}`;
  return url.toString();
}
