import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import { addFavorite, listFavoriteVenueIds, removeFavorite } from './favorites'

describe('favorites api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lista ids de venue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([{ venue: { id: 'a' } }, { venue: { id: 'b' } }]),
      }),
    )
    const api = new ApiClient()
    const ids = await listFavoriteVenueIds(api)
    expect(ids.has('a')).toBe(true)
    expect(ids.has('b')).toBe(true)
  })

  it('POST e DELETE favorito', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    await addFavorite(api, 'v9')
    await removeFavorite(api, 'v9')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/favorites/v9')
    expect(fetchMock.mock.calls[1][0]).toBeDefined()
  })
})
