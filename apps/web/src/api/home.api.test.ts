import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import { fetchHomePromotions, searchVenues } from './home'

describe('home api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchHomePromotions chama GET /home/promotions com query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            title: 'Happy hour',
            venue: { id: 'v1', name: 'Bar' },
          },
        ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const api = new ApiClient()
    const rows = await fetchHomePromotions(api, {
      city: 'São Paulo',
      date: '2026-11-04',
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Happy hour')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/home/promotions')
    expect(url).toContain('city=S')
  })

  it('searchVenues normaliza lista', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([{ id: '1', name: 'Local', category: '🍕 Pizzarias' }]),
      }),
    )
    const api = new ApiClient()
    const rows = await searchVenues(api, { q: 'pizza' })
    expect(rows[0].name).toBe('Local')
  })
})
