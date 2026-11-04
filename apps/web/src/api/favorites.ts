import type { ApiClient } from './client'
import type { FavoriteItem } from '../features/profile/types'

function mapFavorite(raw: Record<string, unknown>): FavoriteItem | null {
  const venueRaw = raw.venue as Record<string, unknown> | undefined
  const venueId =
    venueRaw?.id != null
      ? String(venueRaw.id)
      : raw.venueId != null
        ? String(raw.venueId)
        : ''
  if (!venueId) return null
  return {
    venueId,
    venue: venueRaw
      ? {
          id: String(venueRaw.id ?? venueId),
          name: String(venueRaw.name ?? ''),
          logoUrl: venueRaw.logoUrl as string | null | undefined,
          coverUrl: venueRaw.coverUrl as string | null | undefined,
          city: venueRaw.city as string | null | undefined,
          state: venueRaw.state as string | null | undefined,
        }
      : null,
  }
}

export async function listFavorites(api: ApiClient): Promise<FavoriteItem[]> {
  const data = await api.get<unknown>('/favorites')
  if (!Array.isArray(data)) return []
  return data
    .map((item) =>
      item && typeof item === 'object'
        ? mapFavorite(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is FavoriteItem => !!item)
}

export async function listFavoriteVenueIds(api: ApiClient): Promise<Set<string>> {
  try {
    const items = await listFavorites(api)
    return new Set(items.map((item) => item.venueId))
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
