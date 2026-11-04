import type { CreditPackage } from '../features/venue-credits/types'

export const VIP_WEB_PRICE_BRL = 99.9
export const VIP_WEB_PACKAGE_KEY = 'vip_unit_1'
export const VIP_WEB_PRODUCT_ID = 'after.credits.vip.1'

export function isVipCreditPackage(record: CreditPackage): boolean {
  const modality = (record.modality ?? '').toUpperCase()
  if (modality === 'VIP') return true
  const key = record.key ?? ''
  const product = record.storeProductId ?? ''
  return key.includes('vip') || product.includes('.vip.')
}

function isDisplayableVipOffer(record: CreditPackage): boolean {
  if (!isVipCreditPackage(record)) return false
  if (record.credits !== 1) return false
  if (!record.key) return false
  const store = record.priceBrl
  if (store != null && store > 0) return true
  return (record.referencePriceBrl ?? 0) > 0
}

/** Paridade Flutter `vipWebCheckoutPack`. */
export function vipWebCheckoutPack(record: CreditPackage): CreditPackage | null {
  if (!isDisplayableVipOffer(record)) return null
  if (record.key !== VIP_WEB_PACKAGE_KEY) return null
  if (record.credits !== 1) return null
  const product = record.storeProductId ?? record.productId ?? ''
  if (product !== VIP_WEB_PRODUCT_ID) return null
  const store = record.priceBrl
  const reference = record.referencePriceBrl
  const price =
    store != null && store > 0
      ? store
      : reference != null
        ? reference
        : null
  if (price == null || Math.abs(price - VIP_WEB_PRICE_BRL) > 0.001) return null
  return {
    ...record,
    priceBrl: price,
    storeProductId: VIP_WEB_PRODUCT_ID,
  }
}

export function firstDisplayableVipOffer(packages: CreditPackage[]): CreditPackage | null {
  for (const item of packages) {
    if (isDisplayableVipOffer(item)) return item
  }
  return null
}

export function sortCommonCreditPackages(packages: CreditPackage[]): CreditPackage[] {
  return [...packages].sort((a, b) => a.credits - b.credits || a.key.localeCompare(b.key))
}

export function preferredInitialPackageKey(input: {
  vipOffer: CreditPackage | null
  vipCheckoutReady: boolean
  commonPackages: CreditPackage[]
}): string | null {
  if (
    input.vipOffer &&
    input.vipCheckoutReady &&
    vipWebCheckoutPack(input.vipOffer)
  ) {
    return input.vipOffer.key
  }
  const one = input.commonPackages.find((p) => p.credits === 1)
  if (one) return one.key
  return input.commonPackages[0]?.key ?? null
}
