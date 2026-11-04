import { describe, expect, it } from 'vitest'
import { applyCardPayResult, createCardIdempotencyKey } from './cardCheckout'
import type { CardPayResponse } from '../features/venue-credits/types'

describe('cardCheckout', () => {
  it('idempotency key hex 32 chars', () => {
    const key = createCardIdempotencyKey()
    expect(key).toMatch(/^[0-9a-f]{32}$/)
  })

  it('approved PAID recarrega carteira', () => {
    const result: CardPayResponse = {
      purchaseId: 'p1',
      status: 'PAID',
      provider: 'card',
      amount: 10,
      currency: 'BRL',
      credits: 1,
      orderId: null,
      idempotencyKey: 'abc1234567890123',
      outcome: 'approved',
    }
    const step = applyCardPayResult(
      { idempotencyKey: 'abc1234567890123', phase: 'submitting' },
      result,
    )
    expect(step.reloadWallet).toBe(true)
    expect(step.attempt.phase).toBe('approved')
  })
})
