import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import { blockVenue, fetchVenueDetail, replyVenueReview, submitVenueReview } from './venues'
import { submitReport } from './reports'

describe('venues api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET /venues/:id com query opcional', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 'v1',
          name: 'Bar',
          avgRating: 4.5,
          reviewCount: 2,
          photos: [],
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const api = new ApiClient()
    const detail = await fetchVenueDetail(api, 'v1', { city: 'SP', lat: '-23', lng: '-46' })
    expect(detail.name).toBe('Bar')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/venues/v1')
    expect(url).toContain('city=SP')
  })

  it('POST review e PATCH reply', async () => {
    const payload = { avgRating: 5, reviewCount: 1, reviews: [] }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(payload),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(payload),
      })
    vi.stubGlobal('fetch', fetchMock)

    const api = new ApiClient()
    await submitVenueReview(api, 'v1', { rating: 5, testimonial: 'Top' })
    await replyVenueReview(api, 'v1', 'r1', 'Obrigado')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/venues/v1/reviews')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/reply')
  })

  it('POST block venue', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    await blockVenue(api, 'v1')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/users/me/blocked-venues/v1')
  })
})

describe('reports api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POST /reports corpo VENUE', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    await submitReport(api, {
      targetType: 'VENUE',
      targetId: 'v1',
      reason: 'SPAM',
    })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({
      targetType: 'VENUE',
      targetId: 'v1',
      reason: 'SPAM',
    })
  })
})
