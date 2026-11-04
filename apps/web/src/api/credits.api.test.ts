import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import {
  createPixCreditCharge,
  fetchCardCheckoutConfig,
  fetchCreditPackages,
  fetchCreditPurchaseById,
  fetchCreditPurchases,
  fetchCreditWallet,
  fetchVipCreditPackages,
  payCardCreditPurchase,
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

  it('GET /credits/purchases/:id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'p1',
            packageKey: 'combo_5',
            amountPaid: 50,
            currency: 'BRL',
            credits: 5,
            provider: 'pix',
            status: 'PENDING',
            createdAt: '2026-01-01',
          }),
      }),
    )
    const api = new ApiClient()
    const row = await fetchCreditPurchaseById(api, 'p1')
    expect(row.status).toBe('PENDING')
    expect(row.provider).toBe('pix')
  })

  it('POST /credits/pix/create', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          purchaseId: 'pix-1',
          status: 'PENDING',
          qrCodeText: '00020126',
          qrCodeImage: 'abc',
          amount: 49.9,
          currency: 'BRL',
        }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    const charge = await createPixCreditCharge(api, 'combo_5', { invoiceRequested: false })
    expect(charge.purchaseId).toBe('pix-1')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).packageKey).toBe('combo_5')
  })

  it('GET /credits/card/config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ publicKey: 'TEST-public', maxInstallments: 1 }),
      }),
    )
    const api = new ApiClient()
    const config = await fetchCardCheckoutConfig(api)
    expect(config.publicKey).toBe('TEST-public')
  })

  it('POST /credits/card/pay com idempotency no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          purchaseId: 'c1',
          status: 'PENDING',
          provider: 'card',
          amount: 10,
          currency: 'BRL',
          credits: 1,
          orderId: 'ORD-1',
          idempotencyKey: 'abc1234567890123',
          outcome: 'pending',
        }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    await payCardCreditPurchase(api, {
      packageKey: 'combo_1',
      idempotencyKey: 'abc1234567890123',
      token: 'tok_' + 'x'.repeat(20),
      paymentMethodId: 'visa',
      fiscal: { invoiceRequested: false },
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.paymentType).toBe('credit_card')
    expect(body.installments).toBe(1)
    expect(body.idempotencyKey).toBe('abc1234567890123')
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
