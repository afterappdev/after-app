export type UserRole = 'USER' | 'VENUE' | 'ADMIN'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  state: string
  city: string
  avatarUrl?: string | null
  venueId?: string | null
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

export function isVenueUser(user: AuthUser | null | undefined): boolean {
  return user?.role === 'VENUE'
}
