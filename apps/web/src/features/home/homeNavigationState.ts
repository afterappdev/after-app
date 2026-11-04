import type { VenueSearchFilters } from './venueSearchFilters'

export type HomeNavigationState = {
  mainTab: 'explore' | 'search'
  city: string
  state: string
  venueQuery: string
  selectedDayIso: string
  filters: VenueSearchFilters
}

const STORAGE_KEY = 'after_web_home_state'

export function saveHomeNavigationState(state: HomeNavigationState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function readHomeNavigationState(): HomeNavigationState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as HomeNavigationState
  } catch {
    return null
  }
}
