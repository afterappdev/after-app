import type { ApiClient } from './client'
import type { BlockedVenueItem } from '../features/profile/types'

function mapBlocked(raw: Record<string, unknown>): BlockedVenueItem {
  const venueRaw = raw.venue as Record<string, unknown> | undefined
  return {
    id: String(raw.id ?? raw.venueId ?? venueRaw?.id ?? ''),
    venueId: String(raw.venueId ?? venueRaw?.id ?? ''),
    createdAt: raw.createdAt != null ? String(raw.createdAt) : null,
    venue: venueRaw
      ? {
          id: String(venueRaw.id ?? ''),
          name: String(venueRaw.name ?? ''),
          logoUrl: venueRaw.logoUrl as string | null | undefined,
          coverUrl: venueRaw.coverUrl as string | null | undefined,
          city: venueRaw.city as string | null | undefined,
          state: venueRaw.state as string | null | undefined,
        }
      : null,
  }
}

export async function listBlockedVenues(api: ApiClient): Promise<BlockedVenueItem[]> {
  const data = await api.get<unknown>('/users/me/blocked-venues')
  if (!Array.isArray(data)) return []
  return data
    .map((item) =>
      item && typeof item === 'object'
        ? mapBlocked(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is BlockedVenueItem => !!item?.venueId)
}

export async function unblockVenue(api: ApiClient, venueId: string): Promise<void> {
  await api.delete(`/users/me/blocked-venues/${encodeURIComponent(venueId)}`)
}
