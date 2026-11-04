import { describe, expect, it } from 'vitest'
import { parsePixChargeResponse, qrImageSrc } from './pixCharge'

describe('pixCharge', () => {
  it('parse resposta plana da API', () => {
    const charge = parsePixChargeResponse({
      purchaseId: 'p1',
      status: 'PENDING',
      qrCodeText: 'emv',
      qrCodeImage: 'img64',
      expiresAt: '2026-12-01T12:00:00.000Z',
    })
    expect(charge.purchaseId).toBe('p1')
    expect(charge.qrCodeText).toBe('emv')
  })

  it('qrImageSrc prefixa base64', () => {
    expect(qrImageSrc('abc')).toBe('data:image/png;base64,abc')
    expect(qrImageSrc('https://x/y.png')).toBe('https://x/y.png')
  })
})
