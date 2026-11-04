import { describe, expect, it } from 'vitest'
import { newPublicationIdempotencyKey } from './publicationIdempotency'

describe('publicationIdempotency', () => {
  it('gera chave url-safe >= 16 chars', () => {
    const key = newPublicationIdempotencyKey()
    expect(key.length).toBeGreaterThanOrEqual(16)
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})
