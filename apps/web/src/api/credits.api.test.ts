import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import {
  fetchCreditPackages,
  fetchCreditPurchases,
  fetchCreditWallet,
  fetchVipCreditPackages,
  redeemCreditCoupon,
} from './credits'

describe('credits api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET /credits/wallet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ venueId: 'v1', balance: 5, vipBalance: 2 }),
      }),
    )
    const api = new ApiClient()
    const wallet = await fetchCreditWallet(api)
    expect(wallet.balance).toBe(5)
    expect(wallet.vipBalance).toBe(2)
  })

  it('GET /credits/packages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([{ key: 'p10', credits: 10, priceBrl: 9.9 }]),
      }),
    )
    const api = new ApiClient()
    const rows = await fetchCreditPackages(api)
    expect(rows[0]?.key).toBe('p10')
  })

  it('GET /credits/vip-packages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ key: 'vip1', credits: 1 }]),
      }),
    )
    const api = new ApiClient()
    const rows = await fetchVipCreditPackages(api)
    expect(rows[0]?.key).toBe('vip1')
  })

  it('GET /credits/purchases omite welcome', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              id: 'a',
              packageKey: 'welcome',
              amountPaid: 0,
              currency: 'BRL',
              credits: 1,
              status: 'PAID',
              createdAt: '2026-01-01',
            },
            {
              id: 'b',
              packageKey: 'p10',
              amountPaid: 10,
              currency: 'BRL',
              credits: 10,
              status: 'PAID',
              createdAt: '2026-01-02',
            },
          ]),
      }),
    )
    const api = new ApiClient()
    const rows = await fetchCreditPurchases(api)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.packageKey).toBe('p10')
  })

  it('POST /credits/coupons/redeem', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 'WEB10',
          creditAmount: 10,
          creditKind: 'COMMON',
          balance: 15,
          vipBalance: 2,
        }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    const result = await redeemCreditCoupon(api, ' web10 ')
    expect(result.balance).toBe(15)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).code).toBe('web10')
  })
})
