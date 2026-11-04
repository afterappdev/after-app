import type { ApiClient } from './client'
import type { VenueDetail, VenuePhoto } from '../features/venue/types'
import { mapVenueDetail } from './venues'

export type UpdateOwnedVenuePayload = {
  name?: string
  description?: string
  category?: string
  logoUrl?: string
  coverUrl?: string
  city?: string
  state?: string
  lat?: number
  lng?: number
  contacts?: Record<string, unknown>
  hoursJson?: Record<string, unknown>
}

export type VenueGeocodeResult = { lat: number; lng: number }

export type VenueFiscalDocument = {
  documentType: 'CPF' | 'CNPJ' | null
  documentDigits: string | null
  sufficientForInvoice?: boolean
  additionalFields?: string[]
}

export async function updateOwnedVenue(
  api: ApiClient,
  venueId: string,
  payload: UpdateOwnedVenuePayload,
): Promise<VenueDetail> {
  const data = await api.put<Record<string, unknown>>(
    `/venues/${encodeURIComponent(venueId)}`,
    payload,
  )
  return mapVenueDetail(data)
}

export async function geocodeVenueAddress(
  api: ApiClient,
  query: { address: string; city?: string; state?: string },
): Promise<VenueGeocodeResult> {
  return api.get<VenueGeocodeResult>('/venues/geocode', {
    address: query.address,
    city: query.city,
    state: query.state,
  })
}

export async function addVenuePhoto(
  api: ApiClient,
  venueId: string,
  body: { url: string; kind?: 'GALLERY' | 'MENU'; mediaType?: 'IMAGE' | 'VIDEO' },
): Promise<VenuePhoto[]> {
  const data = await api.post<unknown>(
    `/venues/${encodeURIComponent(venueId)}/photos`,
    body,
  )
  if (Array.isArray(data)) return data as VenuePhoto[]
  if (data && typeof data === 'object' && Array.isArray((data as { photos?: unknown }).photos)) {
    return (data as { photos: VenuePhoto[] }).photos
  }
  return []
}

export async function removeVenuePhoto(
  api: ApiClient,
  venueId: string,
  photoId: string,
): Promise<void> {
  await api.delete(`/venues/${encodeURIComponent(venueId)}/photos/${encodeURIComponent(photoId)}`)
}

export async function fetchVenueFiscalDocument(
  api: ApiClient,
  venueId: string,
): Promise<VenueFiscalDocument> {
  return api.get<VenueFiscalDocument>(
    `/venues/${encodeURIComponent(venueId)}/fiscal-document`,
  )
}

export async function saveVenueFiscalDocument(
  api: ApiClient,
  venueId: string,
  body: { documentType: 'CPF' | 'CNPJ'; documentNumber: string },
): Promise<VenueFiscalDocument> {
  return api.put<VenueFiscalDocument>(
    `/venues/${encodeURIComponent(venueId)}/fiscal-document`,
    body,
  )
}
