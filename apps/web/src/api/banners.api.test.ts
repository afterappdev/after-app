import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import {
  cancelBanner,
  createBanner,
  fetchBannerHistory,
  fetchBannerPricing,
  fetchVipPushOptions,
} from './banners'

describe('banners api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET /banners/pricing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            creditPerDisplayDay: 2,
            vipCreditPerDisplayDay: 3,
            commonCreditsPerVipDay: 1,
          }),
      }),
    )
    const api = new ApiClient()
    const pricing = await fetchBannerPricing(api)
    expect(pricing.creditPerDisplayDay).toBe(2)
    expect(pricing.vipCreditPerDisplayDay).toBe(3)
  })

  it('GET /banners/history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              id: 'b1',
              title: 'Happy',
              status: 'ACTIVE',
              creditsCost: 2,
              schedules: [{ displayDate: '2026-12-01' }],
            },
          ]),
      }),
    )
    const api = new ApiClient()
    const rows = await fetchBannerHistory(api)
    expect(rows[0]?.id).toBe('b1')
  })

  it('POST /banners com Idempotency-Key (VIP multidata)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    await createBanner(
      api,
      {
        imageUrl: 'https://cdn/x.jpg',
        title: 'T',
        description: 'D',
        vipDates: ['2026-12-01', '2026-12-02'],
        vipPublications: [
          { date: '2026-12-01', pushTiming: 'SLOT_11' },
          { date: '2026-12-02', pushTiming: 'SLOT_17' },
        ],
      },
      'idem-key-abc',
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('idem-key-abc')
    const body = JSON.parse(String(init.body))
    expect(body.vipDates).toHaveLength(2)
    expect(body.vipPublications).toHaveLength(2)
  })

  it('POST /banners/:id/cancel', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'CANCELLED' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    await cancelBanner(api, 'b1')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/banners/b1/cancel')
  })

  it('GET /banners/vip-push-options', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ byDate: { '2026-12-01': { options: ['SLOT_11'] } } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    const opts = await fetchVipPushOptions(api, ['2026-12-01', '2026-12-02'])
    expect(String(fetchMock.mock.calls[0][0])).toContain('dates=2026-12-01')
    expect(opts.byDate?.['2026-12-01']?.options?.[0]).toBe('SLOT_11')
  })
})
