import { isVenueUser } from '../../api/types/auth'
import { useAuth } from '../../auth/AuthContext'
import { UserProfilePage } from './UserProfilePage'
import { VenueLocalProfile } from './VenueLocalProfile'

export function ProfileEntry() {
  const { user } = useAuth()
  if (isVenueUser(user)) return <VenueLocalProfile />
  return <UserProfilePage />
}