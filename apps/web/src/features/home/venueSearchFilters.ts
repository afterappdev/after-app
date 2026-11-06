import { VENUE_AMENITIES } from '../../constants/venueAmenities'

export type VenueSearchFilters = {
  category: string | null
  minRating: number
  hasCoverCharge: boolean
  amenities: Record<string, boolean>
}

export function createDefaultVenueSearchFilters(): VenueSearchFilters {
  return {
    category: null,
    minRating: 0,
    hasCoverCharge: false,
    amenities: Object.fromEntries(
      VENUE_AMENITIES.map((item) => [item.key, false]),
    ),
  }
}

export function cloneVenueSearchFilters(
  filters: VenueSearchFilters,
): VenueSearchFilters {
  return {
    category: filters.category,
    minRating: filters.minRating,
    hasCoverCharge: filters.hasCoverCharge,
    amenities: { ...filters.amenities },
  }
}

export function venueFilterCount(filters: VenueSearchFilters): number {
  let count = 0
  if (filters.category) count += 1
  if (filters.minRating > 0) count += 1
  if (filters.hasCoverCharge) count += 1
  count += Object.values(filters.amenities).filter(Boolean).length
  return count
}

export function venueFiltersActive(filters: VenueSearchFilters): boolean {
  return venueFilterCount(filters) > 0
}

/** Query params for GET /venues/search (Flutter parity). */
export function buildVenueSearchQuery(
  q: string,
  filters: VenueSearchFilters,
): Record<string, string> {
  const query: Record<string, string> = { q: q.trim() }
  if (filters.category) query.category = filters.category
  if (filters.minRating > 0) query.minRating = String(filters.minRating)
  if (filters.hasCoverCharge) query.hasCoverCharge = 'true'
  for (const item of VENUE_AMENITIES) {
    if (filters.amenities[item.key]) {
      query[item.key] = 'true'
    }
  }
  return query
}

export function buildOriginQuery(
  city: string,
  origin: { lat: number; lng: number } | null,
  state?: string,
): Record<string, string> {
  const query: Record<string, string> = { city }
  const uf = state?.trim()
  if (uf) query.state = uf
  if (origin) {
    query.lat = String(origin.lat)
    query.lng = String(origin.lng)
  }
  return query
}
