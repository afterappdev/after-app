import { useAuth } from '../../auth/AuthContext'
import { useActiveVenue } from '../../auth/ActiveVenueContext'

/** venueId da sessão; multi-estabelecimento OFF usa `user.venueId`. */
export function useOwnedVenueId(): string | null {
  const { user } = useAuth()
  const { activeVenueId } = useActiveVenue()
  if (user?.role !== 'VENUE') return null
  return activeVenueId ?? user.venueId ?? null
}
