import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import {
  addVenuePhoto,
  geocodeVenueAddress,
  removeVenuePhoto,
  saveVenueFiscalDocument,
  updateOwnedVenue,
} from './venueOwner'

describe('venueOwner api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('PUT /venues/:id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'v1', name: 'Bar' }),
      }),
    )
    const api = new ApiClient()
    const venue = await updateOwnedVenue(api, 'v1', { name: 'Bar' })
    expect(venue.name).toBe('Bar')
  })

  it('GET /venues/geocode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ lat: -23.5, lng: -46.6 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    const point = await geocodeVenueAddress(api, { address: 'Rua A', city: 'SP' })
    expect(point.lat).toBe(-23.5)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/venues/geocode')
  })

  it('POST e DELETE photos', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([]),
      })
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    await addVenuePhoto(api, 'v1', { url: 'https://x/y.jpg', kind: 'GALLERY' })
    await removeVenuePhoto(api, 'v1', 'p1')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/photos')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/photos/p1')
  })

  it('PUT fiscal-document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ documentType: 'CPF', documentDigits: '12345678909' }),
      }),
    )
    const api = new ApiClient()
    const doc = await saveVenueFiscalDocument(api, 'v1', {
      documentType: 'CPF',
      documentNumber: '12345678909',
    })
    expect(doc.documentType).toBe('CPF')
  })
})
