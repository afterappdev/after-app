import type { ApiClient } from './client'
import type { ReviewStatsPayload, VenueDetail } from '../features/venue/types'

export function mapVenueDetail(raw: Record<string, unknown>): VenueDetail {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    description: raw.description as string | null | undefined,
    category: raw.category as string | null | undefined,
    city: raw.city as string | null | undefined,
    state: raw.state as string | null | undefined,
    logoUrl: raw.logoUrl as string | null | undefined,
    coverUrl: raw.coverUrl as string | null | undefined,
    lat: raw.lat as number | null | undefined,
    lng: raw.lng as number | null | undefined,
    hoursJson: raw.hoursJson as Record<string, unknown> | null | undefined,
    contacts: raw.contacts as VenueDetail['contacts'],
    photos: raw.photos as VenueDetail['photos'],
    banners: raw.banners as VenueDetail['banners'],
    isOpen: raw.isOpen as boolean | null | undefined,
    isOwner: raw.isOwner === true,
    distanceKm: raw.distanceKm as number | null | undefined,
    avgRating: raw.avgRating as number | null | undefined,
    reviewCount: (raw.reviewCount as number | undefined) ?? 0,
    reviews: raw.reviews as VenueDetail['reviews'],
  }
}

export async function fetchVenueDetail(
  api: ApiClient,
  venueId: string,
  query?: Record<string, string | undefined>,
): Promise<VenueDetail> {
  const data = await api.get<Record<string, unknown>>(
    `/venues/${encodeURIComponent(venueId)}`,
    query,
  )
  return mapVenueDetail(data)
}

export async function fetchVenueReviews(
  api: ApiClient,
  venueId: string,
): Promise<ReviewStatsPayload> {
  const data = await api.get<ReviewStatsPayload>(
    `/venues/${encodeURIComponent(venueId)}/reviews`,
  )
  return data
}

export async function submitVenueReview(
  api: ApiClient,
  venueId: string,
  body: { rating: number; testimonial: string },
): Promise<ReviewStatsPayload> {
  return api.post<ReviewStatsPayload>(
    `/venues/${encodeURIComponent(venueId)}/reviews`,
    body,
  )
}

export async function replyVenueReview(
  api: ApiClient,
  venueId: string,
  reviewId: string,
  reply: string,
): Promise<ReviewStatsPayload> {
  return api.patch<ReviewStatsPayload>(
    `/venues/${encodeURIComponent(venueId)}/reviews/${encodeURIComponent(reviewId)}/reply`,
    { reply },
  )
}

export async function blockVenue(api: ApiClient, venueId: string): Promise<void> {
  await api.post(`/users/me/blocked-venues/${encodeURIComponent(venueId)}`)
}
