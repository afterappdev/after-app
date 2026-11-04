import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
} from './notifications'

describe('notifications api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET /notifications e unread-count', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              id: 'n1',
              title: 'Nova promo',
              venue: { id: 'v1', name: 'Bar' },
            },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ count: 2 }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    const rows = await fetchNotifications(api)
    expect(rows[0].venue?.name).toBe('Bar')
    expect(await fetchUnreadNotificationCount(api)).toBe(2)
  })

  it('PATCH read-all', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await markAllNotificationsRead(new ApiClient())
    expect(String(fetchMock.mock.calls[0][0])).toContain('/notifications/read-all')
  })
})
