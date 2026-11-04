export type VenuePhoto = {
  id: string
  url: string
  kind?: string | null
  mediaType?: string | null
  sortOrder?: number | null
}

export type VenueBannerSchedule = {
  id?: string
  displayDate?: string | null
  tier?: string | null
}

export type VenueBanner = {
  id: string
  title?: string | null
  description?: string | null
  imageUrl?: string | null
  status?: string | null
  schedules?: VenueBannerSchedule[]
}

export type VenueReviewUser = {
  id: string
  name: string
  avatarUrl?: string | null
}

export type VenueReview = {
  id: string
  userId: string
  rating: number
  testimonial?: string | null
  venueReply?: string | null
  venueReplyAt?: string | null
  createdAt?: string
  user?: VenueReviewUser
}

export type VenueContacts = Record<string, unknown> & {
  address?: string
  phone?: string
  whatsapp?: string
  instagram?: string
  hasCoverCharge?: boolean
  coverCharge?: string
}

export type VenueDetail = {
  id: string
  name: string
  description?: string | null
  category?: string | null
  city?: string | null
  state?: string | null
  logoUrl?: string | null
  coverUrl?: string | null
  lat?: number | null
  lng?: number | null
  hoursJson?: Record<string, unknown> | null
  contacts?: VenueContacts | null
  photos?: VenuePhoto[]
  banners?: VenueBanner[]
  isOpen?: boolean | null
  isOwner?: boolean
  distanceKm?: number | null
  avgRating?: number | null
  reviewCount?: number
  reviews?: VenueReview[]
}

export type ReviewStatsPayload = {
  avgRating: number | null
  reviewCount: number
  reviews: VenueReview[]
}
