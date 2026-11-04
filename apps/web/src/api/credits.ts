import type { ApiClient } from './client'
import type { CouponRedeemResult, CreditPackage, CreditPurchase, CreditWallet } from '../features/venue-credits/types'

export async function fetchCreditWallet(api: ApiClient): Promise<CreditWallet> {
  const data = await api.get<Record<string, unknown>>('/credits/wallet')
  return {
    venueId: String(data.venueId ?? ''),
    balance: Number(data.balance ?? 0),
    vipBalance: Number(data.vipBalance ?? 0),
  }
}

function mapPackage(raw: Record<string, unknown>): CreditPackage {
  return {
    key: String(raw.key ?? ''),
    credits: Number(raw.credits ?? 0),
    priceBrl: raw.priceBrl != null ? Number(raw.priceBrl) : undefined,
    referencePriceBrl:
      raw.referencePriceBrl != null ? Number(raw.referencePriceBrl) : undefined,
    modality: raw.modality != null ? String(raw.modality) : undefined,
    storeProductId: raw.storeProductId != null ? String(raw.storeProductId) : undefined,
    currency: raw.currency != null ? String(raw.currency) : undefined,
  }
}

export async function fetchCreditPackages(api: ApiClient): Promise<CreditPackage[]> {
  const data = await api.get<unknown>('/credits/packages')
  if (!Array.isArray(data)) return []
  return data
    .map((item) =>
      item && typeof item === 'object' ? mapPackage(item as Record<string, unknown>) : null,
    )
    .filter((item): item is CreditPackage => !!item?.key)
}

export async function fetchVipCreditPackages(api: ApiClient): Promise<CreditPackage[]> {
  const data = await api.get<unknown>('/credits/vip-packages')
  if (!Array.isArray(data)) return []
  return data
    .map((item) =>
      item && typeof item === 'object' ? mapPackage(item as Record<string, unknown>) : null,
    )
    .filter((item): item is CreditPackage => !!item?.key)
}

function mapPurchase(raw: Record<string, unknown>): CreditPurchase {
  return {
    id: String(raw.id ?? ''),
    packageKey: String(raw.packageKey ?? ''),
    amountPaid: Number(raw.amountPaid ?? 0),
    currency: String(raw.currency ?? 'BRL'),
    credits: Number(raw.credits ?? 0),
    provider: raw.provider != null ? String(raw.provider) : null,
    status: String(raw.status ?? ''),
    modality: raw.modality === 'VIP' ? 'VIP' : 'COMMON',
    createdAt: String(raw.createdAt ?? ''),
  }
}

export async function fetchCreditPurchases(api: ApiClient): Promise<CreditPurchase[]> {
  const data = await api.get<unknown>('/credits/purchases')
  if (!Array.isArray(data)) return []
  return data
    .map((item) =>
      item && typeof item === 'object' ? mapPurchase(item as Record<string, unknown>) : null,
    )
    .filter((item): item is CreditPurchase => !!item?.id)
    .filter((item) => item.packageKey !== 'welcome')
}

export async function redeemCreditCoupon(
  api: ApiClient,
  code: string,
): Promise<CouponRedeemResult> {
  return api.post<CouponRedeemResult>('/credits/coupons/redeem', { code: code.trim() })
}
