const RESERVED_VENUE_SEGMENTS = new Set(['geocode', 'search'])

export function normalizeApiPath(path: string): string {
  let value = path.trim()
  if (!value) return '/'
  const q = value.indexOf('?')
  if (q >= 0) value = value.slice(0, q)
  if (!value.startsWith('/')) value = `/${value}`
  if (value.length > 1 && value.endsWith('/')) {
    value = value.slice(0, -1)
  }
  return value
}

/** GET paths that use OptionalJwtAuthGuard on the API (Flutter parity). */
export function isOptionalAuthGet(path: string): boolean {
  const normalized = normalizeApiPath(path)
  switch (normalized) {
    case '/home/promotions':
    case '/home/venues':
    case '/venues':
    case '/venues/search':
      return true
  }
  const reviews = /^\/venues\/([^/]+)\/reviews$/.exec(normalized)
  if (reviews && !RESERVED_VENUE_SEGMENTS.has(reviews[1])) return true
  const detail = /^\/venues\/([^/]+)$/.exec(normalized)
  if (detail && !RESERVED_VENUE_SEGMENTS.has(detail[1])) return true
  return false
}

export function buildQueryString(
  query?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}
