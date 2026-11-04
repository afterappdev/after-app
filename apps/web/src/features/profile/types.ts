export type ProfileVenueSummary = {
  id: string
  name: string
  logoUrl?: string | null
  coverUrl?: string | null
  city?: string | null
  state?: string | null
}

export type FavoriteItem = {
  venueId: string
  venue: ProfileVenueSummary | null
}

export type BlockedVenueItem = {
  id: string
  venueId: string
  createdAt?: string | null
  venue: ProfileVenueSummary | null
}

export type NotificationItem = {
  id: string
  title?: string | null
  body?: string | null
  readAt?: string | null
  createdAt?: string | null
  venueId?: string | null
  venue: ProfileVenueSummary | null
}
