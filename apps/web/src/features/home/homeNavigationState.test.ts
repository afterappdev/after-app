import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultVenueSearchFilters } from './venueSearchFilters'
import {
  readHomeNavigationState,
  saveHomeNavigationState,
} from './homeNavigationState'

describe('homeNavigationState', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
    })
  })

  afterEach(() => {
    store.clear()
    vi.unstubAllGlobals()
  })

  it('persiste e restaura aba, cidade e filtros', () => {
    saveHomeNavigationState({
      mainTab: 'search',
      city: 'Curitiba',
      state: 'PR',
      venueQuery: 'bar',
      selectedDayIso: '2026-11-04T03:00:00.000Z',
      filters: { ...createDefaultVenueSearchFilters(), minRating: 4 },
    })
    const restored = readHomeNavigationState()
    expect(restored?.mainTab).toBe('search')
    expect(restored?.city).toBe('Curitiba')
    expect(restored?.venueQuery).toBe('bar')
    expect(restored?.filters.minRating).toBe(4)
  })
})
