import { presentVenueCategory, VENUE_CATEGORIES } from './venueCategories'

export const LEGACY_LIVE_MUSIC = '🎵 Música ao Vivo'

export function venueCategorySelection(value: string | null | undefined): string {
  const shown = presentVenueCategory(value)
  if (!shown || shown === LEGACY_LIVE_MUSIC) return ''
  return VENUE_CATEGORIES.includes(shown) ? shown : shown
}

export function requiresCategoryReselection(value: string | null | undefined): boolean {
  const raw = value?.trim() ?? ''
  const shown = presentVenueCategory(raw)
  return shown === LEGACY_LIVE_MUSIC || (raw !== '' && !VENUE_CATEGORIES.includes(shown))
}
