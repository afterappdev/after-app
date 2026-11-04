import { describe, expect, it } from 'vitest'
import {
  buildOriginQuery,
  buildVenueSearchQuery,
  createDefaultVenueSearchFilters,
  venueFilterCount,
} from './venueSearchFilters'

describe('venueSearchFilters', () => {
  it('conta filtros ativos', () => {
    const filters = createDefaultVenueSearchFilters()
    expect(venueFilterCount(filters)).toBe(0)
    filters.category = '🍕 Pizzarias'
    filters.minRating = 4
    filters.amenities.hasWifi = true
    expect(venueFilterCount(filters)).toBe(3)
  })

  it('monta query de busca como Flutter', () => {
    const filters = createDefaultVenueSearchFilters()
    filters.category = '🍕 Pizzarias'
    filters.minRating = 4
    filters.hasCoverCharge = true
    filters.amenities.isPetFriendly = true
    expect(buildVenueSearchQuery('bar', filters)).toEqual({
      q: 'bar',
      category: '🍕 Pizzarias',
      minRating: '4',
      hasCoverCharge: 'true',
      isPetFriendly: 'true',
    })
  })

  it('monta origin query com lat/lng', () => {
    expect(buildOriginQuery('São Paulo', { lat: -23.5, lng: -46.6 })).toEqual({
      city: 'São Paulo',
      lat: '-23.5',
      lng: '-46.6',
    })
  })
})
