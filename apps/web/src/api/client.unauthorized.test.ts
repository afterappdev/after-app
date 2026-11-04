import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'

describe('ApiClient 401', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('chama onUnauthorized quando Bearer enviado', async () => {
    const onUnauthorized = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Unauthorized' }),
      }),
    )
    const api = new ApiClient({
      getToken: () => 'expired-jwt',
      onUnauthorized,
    })
    await expect(api.get('/users/me')).rejects.toMatchObject({ statusCode: 401 })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('401 em GET público opcional refaz sem auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: [] }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const onUnauthorized = vi.fn()
    const api = new ApiClient({
      getToken: () => 'bad',
      onUnauthorized,
    })
    const data = await api.get<{ items: unknown[] }>('/venues/home')
    expect(data.items).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Headers
    expect(secondHeaders.get('Authorization')).toBeNull()
  })
})
