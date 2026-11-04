import type { ApiClient } from './client'
import type {
  CardCheckoutConfig,
  CardPayResponse,
  CouponRedeemResult,
  CreditPackage,
  CreditPurchase,
  CreditWallet,
  FiscalPurchasePayload,
  PixChargeResult,
} from '../features/venue-credits/types'
import { parsePixChargeResponse } from '../utils/pixCharge'

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
    productId: raw.productId != null ? String(raw.productId) : undefined,
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
  const packageKey = String(raw.packageKey ?? '')
  const productId = raw.productId != null ? String(raw.productId) : ''
  const modality =
    raw.modality === 'VIP' ||
    packageKey === 'vip_unit_1' ||
    productId.includes('.vip.')
      ? 'VIP'
      : 'COMMON'
  return {
    id: String(raw.id ?? ''),
    packageKey,
    amountPaid: Number(raw.amountPaid ?? 0),
    currency: String(raw.currency ?? 'BRL'),
    credits: Number(raw.credits ?? 0),
    provider: raw.provider != null ? String(raw.provider) : null,
    status: String(raw.status ?? ''),
    modality,
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

export async function fetchCreditPurchaseById(
  api: ApiClient,
  purchaseId: string,
): Promise<CreditPurchase> {
  const data = await api.get<Record<string, unknown>>(
    `/credits/purchases/${encodeURIComponent(purchaseId)}`,
  )
  return mapPurchase(data)
}

export async function createPixCreditCharge(
  api: ApiClient,
  packageKey: string,
  fiscal: FiscalPurchasePayload,
): Promise<PixChargeResult> {
  const data = await api.post<Record<string, unknown>>('/credits/pix/create', {
    packageKey,
    ...fiscal,
  })
  return parsePixChargeResponse(data)
}

export async function fetchCardCheckoutConfig(api: ApiClient): Promise<CardCheckoutConfig> {
  const data = await api.get<Record<string, unknown>>('/credits/card/config')
  return {
    publicKey: String(data.publicKey ?? ''),
    maxInstallments: Number(data.maxInstallments ?? 1),
  }
}

export async function payCardCreditPurchase(
  api: ApiClient,
  body: {
    packageKey: string
    idempotencyKey: string
    token: string
    paymentMethodId: string
    fiscal: FiscalPurchasePayload
  },
): Promise<CardPayResponse> {
  return api.post<CardPayResponse>('/credits/card/pay', {
    packageKey: body.packageKey,
    idempotencyKey: body.idempotencyKey,
    token: body.token,
    paymentMethodId: body.paymentMethodId,
    paymentType: 'credit_card',
    installments: 1,
    ...body.fiscal,
  })
}
