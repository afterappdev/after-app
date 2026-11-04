import type { AuthUser } from '../../api/types/auth'

export function canManageVenue(user: AuthUser | null, venueId: string | null): boolean {
  if (!user || user.role !== 'VENUE' || !venueId) return false
  if (user.venueId && user.venueId !== venueId) return false
  return true
}
