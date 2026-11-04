/** Paridade Flutter `oauth_callback.dart`, ajustado para SPA em `/app/`. */

export function oauthBrowserRedirect(): string {
  const base = import.meta.env.BASE_URL || '/'
  const path = base.endsWith('/') ? base : `${base}/`
  return new URL(path, window.location.origin).href
}

function queryFromHash(): URLSearchParams {
  const hash = window.location.hash.replace(/^#/, '')
  const qIndex = hash.indexOf('?')
  if (qIndex === -1) return new URLSearchParams()
  return new URLSearchParams(hash.slice(qIndex + 1))
}

export function oauthTokenFromLocation(searchParams: URLSearchParams): string | null {
  const fromRoute = searchParams.get('token')
  if (fromRoute?.trim()) return fromRoute.trim()
  const fromHash = queryFromHash().get('token')
  return fromHash?.trim() || null
}

export function oauthOnboardingFromLocation(searchParams: URLSearchParams): string | null {
  const fromRoute = searchParams.get('onboarding')
  if (fromRoute?.trim()) return fromRoute.trim()
  const fromHash = queryFromHash().get('onboarding')
  return fromHash?.trim() || null
}

export function sanitizeOAuthErrorMessage(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || trimmed.length > 180) return null
  if (trimmed.includes('{') || trimmed.includes('statusCode')) {
    return 'Não foi possível concluir o login social.'
  }
  return trimmed
}

export function oauthStartUrl(provider: 'google' | 'apple', apiBase: string): string {
  const redirect = encodeURIComponent(oauthBrowserRedirect())
  return `${apiBase.replace(/\/$/, '')}/auth/${provider}/start?redirect=${redirect}`
}
