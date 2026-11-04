export type VenueSummary = {
  id: string
  name: string
  logoUrl?: string | null
  coverUrl?: string | null
  description?: string | null
  category?: string | null
  city?: string | null
  state?: string | null
  isOpen?: boolean | null
  distanceKm?: number | null
  avgRating?: number | null
  reviewCount?: number | null
}

export type HomePromotion = {
  bannerId?: string
  scheduleId?: string | null
  tier?: string
  featured?: boolean
  imageUrl?: string | null
  title?: string | null
  description?: string | null
  displayDate?: string | null
  venue?: VenueSummary | null
  isOpen?: boolean | null
  distanceKm?: number | null
}

export type CityOption = {
  name: string
  uf: string
}

export type GeoOrigin = {
  lat: number
  lng: number
}
