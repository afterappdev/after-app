import type { AuthUser } from '../../api/types/auth'
import type { VenueDetail } from './types'

export function isVenueOwner(user: AuthUser | null, venue: VenueDetail | null): boolean {
  if (!user || user.role !== 'VENUE' || !venue) return false
  if (venue.isOwner) return true
  if (user.venueId && (user.venueId === venue.id)) return true
  return false
}

export function canFavorite(user: AuthUser | null): boolean {
  return !!user && user.role === 'USER'
}

export function canReview(user: AuthUser | null, venue: VenueDetail | null): boolean {
  return !!user && user.role === 'USER' && !isVenueOwner(user, venue)
}

export function canReply(user: AuthUser | null, venue: VenueDetail | null): boolean {
  return isVenueOwner(user, venue)
}

export function canBlockOrReport(user: AuthUser | null, venue: VenueDetail | null): boolean {
  if (!venue) return false
  return !isVenueOwner(user, venue)
}
