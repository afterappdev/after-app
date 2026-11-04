import type { ApiClient } from './client'
import type { HomePromotion, VenueSummary } from '../features/home/types'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function mapVenue(raw: Record<string, unknown>): VenueSummary {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    logoUrl: raw.logoUrl as string | null | undefined,
    coverUrl: raw.coverUrl as string | null | undefined,
    description: raw.description as string | null | undefined,
    category: raw.category as string | null | undefined,
    city: raw.city as string | null | undefined,
    state: raw.state as string | null | undefined,
    isOpen: raw.isOpen as boolean | null | undefined,
    distanceKm: raw.distanceKm as number | null | undefined,
    avgRating: raw.avgRating as number | null | undefined,
    reviewCount: raw.reviewCount as number | null | undefined,
  }
}

function mapPromotion(raw: Record<string, unknown>): HomePromotion {
  const venueRaw = raw.venue
  return {
    bannerId: raw.bannerId != null ? String(raw.bannerId) : undefined,
    scheduleId: raw.scheduleId as string | null | undefined,
    tier: raw.tier != null ? String(raw.tier) : undefined,
    featured: raw.featured === true || raw.tier === 'VIP',
    imageUrl: raw.imageUrl as string | null | undefined,
    title: raw.title as string | null | undefined,
    description: raw.description as string | null | undefined,
    displayDate: raw.displayDate as string | null | undefined,
    venue:
      venueRaw && typeof venueRaw === 'object'
        ? mapVenue(venueRaw as Record<string, unknown>)
        : null,
    isOpen: raw.isOpen as boolean | null | undefined,
    distanceKm: raw.distanceKm as number | null | undefined,
  }
}

export async function fetchHomePromotions(
  api: ApiClient,
  query: Record<string, string>,
): Promise<HomePromotion[]> {
  const data = await api.get<unknown>('/home/promotions', query)
  if (!Array.isArray(data)) return []
  return data.map((item) => mapPromotion(asRecord(item)))
}

export async function fetchHomeVenues(
  api: ApiClient,
  query: Record<string, string>,
): Promise<VenueSummary[]> {
  const data = await api.get<unknown>('/home/venues', query)
  if (!Array.isArray(data)) return []
  return data.map((item) => mapVenue(asRecord(item)))
}

export async function searchVenues(
  api: ApiClient,
  query: Record<string, string>,
): Promise<VenueSummary[]> {
  const data = await api.get<unknown>('/venues/search', query)
  if (!Array.isArray(data)) return []
  return data.map((item) => mapVenue(asRecord(item)))
}
