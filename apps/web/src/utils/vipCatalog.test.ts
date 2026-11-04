import { describe, expect, it } from 'vitest'
import { vipWebCheckoutPack, VIP_WEB_PACKAGE_KEY, VIP_WEB_PRODUCT_ID } from './vipCatalog'
import type { CreditPackage } from '../features/venue-credits/types'

describe('vipCatalog', () => {
  it('vip web pack exige preço 99.9 e produto oficial', () => {
    const offer: CreditPackage = {
      key: VIP_WEB_PACKAGE_KEY,
      credits: 1,
      referencePriceBrl: 99.9,
      storeProductId: VIP_WEB_PRODUCT_ID,
      modality: 'VIP',
    }
    const pack = vipWebCheckoutPack(offer)
    expect(pack?.priceBrl).toBe(99.9)
  })
})
