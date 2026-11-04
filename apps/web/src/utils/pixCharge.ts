import type { PixChargeResult } from '../features/venue-credits/types'

function asMap(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return null
}

function str(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text.length ? text : null
}

function money(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function parsePixChargeResponse(json: Record<string, unknown>): PixChargeResult {
  const purchase = asMap(json.purchase)
  const pix = asMap(json.pix) ?? asMap(json.charge)
  const purchaseId = str(json.purchaseId) ?? str(purchase?.id)
  if (!purchaseId) {
    throw new Error('Resposta PIX sem purchaseId.')
  }
  return {
    purchaseId,
    paymentId: str(json.paymentId) ?? str(pix?.paymentId) ?? str(pix?.id),
    status: str(json.status) ?? str(purchase?.status) ?? 'PENDING',
    amount: money(json.amount) ?? money(pix?.amount) ?? money(purchase?.amountPaid),
    currency: str(json.currency) ?? str(pix?.currency) ?? str(purchase?.currency) ?? 'BRL',
    qrCodeText:
      str(json.qrCodeText) ??
      str(pix?.qrCodeText) ??
      str(pix?.copyPaste) ??
      str(pix?.emv),
    qrCodeImage:
      str(json.qrCodeImage) ?? str(pix?.qrCodeImage) ?? str(pix?.qrCodeUrl),
    expiresAt: str(json.expiresAt) ?? str(pix?.expiresAt),
  }
}

export function qrImageSrc(qrCodeImage: string | null | undefined): string | null {
  const raw = qrCodeImage?.trim()
  if (!raw) return null
  if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw
  }
  return `data:image/png;base64,${raw}`
}
