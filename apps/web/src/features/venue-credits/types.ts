export type CreditWallet = {
  venueId: string
  balance: number
  vipBalance: number
}

export type CreditPackage = {
  key: string
  credits: number
  priceBrl?: number
  referencePriceBrl?: number
  modality?: string
  storeProductId?: string
  productId?: string
  currency?: string
}

export type CreditPurchase = {
  id: string
  packageKey: string
  amountPaid: number
  currency: string
  credits: number
  provider: string | null
  status: string
  modality: 'COMMON' | 'VIP'
  createdAt: string
}

export type BannerPricing = {
  creditPerDisplayDay: number
  vipCreditPerDisplayDay: number
  commonCreditsPerVipDay: number
}

export type BannerSchedule = {
  id?: string
  displayDate?: string | null
  tier?: string | null
}

export type BannerHistoryItem = {
  id: string
  title?: string | null
  description?: string | null
  imageUrl?: string | null
  status?: string | null
  creditsCost?: number | null
  schedules?: BannerSchedule[]
}

export type VipPublicationInput = {
  date: string
  pushTiming: 'IMMEDIATE' | 'SLOT_11' | 'SLOT_17'
}

export type CreateBannerPayload = {
  imageUrl: string
  title: string
  description: string
  dates?: string[]
  vipDates?: string[]
  vipPublications?: VipPublicationInput[]
}

export type CouponRedeemResult = {
  code: string
  creditAmount: number
  creditKind: string
  balance: number
  vipBalance: number
}

export type FiscalPurchasePayload = {
  invoiceRequested: boolean
  fiscalPersonType?: 'CPF' | 'CNPJ'
  fiscalName?: string
  fiscalDocument?: string
  fiscalEmail?: string
}

export type PixChargeResult = {
  purchaseId: string
  paymentId?: string | null
  status: string
  amount?: number
  currency?: string
  qrCodeText?: string | null
  qrCodeImage?: string | null
  expiresAt?: string | null
}

export type CardCheckoutConfig = {
  publicKey: string
  maxInstallments: number
}

export type CardPayOutcome =
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'unknown'
  | 'cancelled'
  | 'refunded'

export type CardPayResponse = {
  purchaseId: string
  status: string
  provider: 'card'
  amount: number
  currency: 'BRL'
  credits: number
  orderId: string | null
  idempotencyKey: string
  outcome: CardPayOutcome
}
