import type { ApiClient } from './client'

export async function listFavoriteVenueIds(api: ApiClient): Promise<Set<string>> {
  try {
    const data = await api.get<unknown>('/favorites')
    if (!Array.isArray(data)) return new Set()
    const ids = data
      .map((item) => {
        const row = item as Record<string, unknown>
        const venue = row.venue as Record<string, unknown> | undefined
        return venue?.id != null ? String(venue.id) : ''
      })
      .filter(Boolean)
    return new Set(ids)
  } catch {
    return new Set()
  }
}

export async function addFavorite(api: ApiClient, venueId: string): Promise<void> {
  await api.post(`/favorites/${encodeURIComponent(venueId)}`)
}

export async function removeFavorite(
  api: ApiClient,
  venueId: string,
): Promise<void> {
  await api.delete(`/favorites/${encodeURIComponent(venueId)}`)
}
