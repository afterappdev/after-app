import { ApiError } from '../api/client'
import type { CreditPurchase } from '../features/venue-credits/types'
import { isTerminalPurchaseStatus } from './purchaseLabels'

export const DEFAULT_POLL_INTERVAL_MS = 4000
export const DEFAULT_POLL_TIMEOUT_MS = 10 * 60 * 1000

export function isPendingMercadoPagoPurchase(purchase: CreditPurchase): boolean {
  const provider = (purchase.provider ?? '').trim().toLowerCase()
  const status = (purchase.status ?? '').trim().toUpperCase()
  return status === 'PENDING' && (provider === 'pix' || provider === 'card')
}

export async function reconcilePendingPurchases(input: {
  purchases: CreditPurchase[]
  fetchById: (id: string) => Promise<CreditPurchase>
}): Promise<{ purchases: CreditPurchase[]; anyBecamePaid: boolean }> {
  const next = [...input.purchases]
  let anyBecamePaid = false
  for (let i = 0; i < next.length; i += 1) {
    const row = next[i]
    if (!row || !isPendingMercadoPagoPurchase(row)) continue
    try {
      const updated = await input.fetchById(row.id)
      next[i] = updated
      if (updated.status.toUpperCase() === 'PAID') anyBecamePaid = true
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) throw err
    }
  }
  return { purchases: next, anyBecamePaid }
}

export function createPurchasePoller(input: {
  fetchStatus: (purchaseId: string) => Promise<string>
  intervalMs?: number
  timeoutMs?: number
}) {
  let timer: ReturnType<typeof setInterval> | null = null
  let deadline: ReturnType<typeof setTimeout> | null = null
  let active = false

  function stop() {
    active = false
    if (timer) clearInterval(timer)
    timer = null
    if (deadline) clearTimeout(deadline)
    deadline = null
  }

  function start(options: {
    purchaseId: string
    onStatus: (status: string) => void
    onTimeout?: () => void
    onFatalError?: (error: unknown) => void
  }) {
    stop()
    active = true
    const intervalMs = input.intervalMs ?? DEFAULT_POLL_INTERVAL_MS
    const timeoutMs = input.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS

    deadline = setTimeout(() => {
      if (!active) return
      stop()
      options.onTimeout?.()
    }, timeoutMs)

    async function tick() {
      if (!active) return
      try {
        const status = await input.fetchStatus(options.purchaseId)
        if (!active) return
        options.onStatus(status)
        if (isTerminalPurchaseStatus(status)) stop()
      } catch (error) {
        if (!active) return
        if (isTransientPollError(error)) return
        stop()
        options.onFatalError?.(error)
      }
    }

    void tick()
    timer = setInterval(() => void tick(), intervalMs)
  }

  return { start, stop, get isActive() {
    return active
  } }
}

function isTransientPollError(error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.statusCode === 0) return true
    if (error.statusCode >= 500 && error.statusCode <= 599) return true
    if (error.statusCode === 408 || error.statusCode === 429) return true
    return false
  }
  return true
}
