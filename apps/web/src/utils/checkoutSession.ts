import type { PixChargeResult } from '../features/venue-credits/types'

const STORAGE_KEY = 'after.web.checkout.pending'

export type CheckoutSession = {
  purchaseId: string
  method: 'pix' | 'card'
  packageKey: string
  pix?: Pick<
    PixChargeResult,
    'qrCodeText' | 'qrCodeImage' | 'expiresAt' | 'amount' | 'currency' | 'status'
  >
}

export function saveCheckoutSession(session: CheckoutSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    /* quota / private mode */
  }
}

export function readCheckoutSession(): CheckoutSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CheckoutSession
    if (!parsed?.purchaseId || !parsed.packageKey) return null
    return parsed
  } catch {
    return null
  }
}

export function clearCheckoutSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
