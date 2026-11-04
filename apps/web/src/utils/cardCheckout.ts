import type { CardPayResponse } from '../features/venue-credits/types'

export const CARD_APPROVED_MESSAGE =
  'Pagamento aprovado. Seus créditos já estão na carteira.'
export const CARD_REJECTED_MESSAGE =
  'Pagamento recusado. Nenhum crédito foi adicionado. Você pode tentar outro cartão.'
export const CARD_PENDING_MESSAGE =
  'Pagamento em análise. Os créditos só entram depois da confirmação do servidor.'
export const CARD_POLL_TIMEOUT_MESSAGE =
  'Ainda não identificamos a confirmação. Não faremos outra cobrança. Consulte o histórico.'
export const CARD_DUPLICATE_SUBMIT_MESSAGE = 'Este pagamento já está em andamento.'

export type CardAttemptPhase =
  | 'ready'
  | 'submitting'
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'cancelled'
  | 'refunded'
  | 'unknown'

export type CardAttempt = {
  idempotencyKey: string
  phase: CardAttemptPhase
  purchaseId?: string | null
  message?: string | null
  pollTimedOut?: boolean
}

export function createCardIdempotencyKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function cardAttemptAcceptsSubmit(attempt: CardAttempt): boolean {
  return attempt.phase === 'ready' || attempt.phase === 'rejected' || attempt.phase === 'cancelled'
}

export function cardAttemptAllowsMethodSwitch(attempt: CardAttempt): boolean {
  return cardAttemptAcceptsSubmit(attempt)
}

function usablePurchaseId(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  return text.length ? text : null
}

function usableOrderId(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  if (!text || /^\d+$/.test(text)) return null
  return text
}

export function beginCardSubmit(attempt: CardAttempt, nextKey: () => string): CardAttempt {
  if (!cardAttemptAcceptsSubmit(attempt)) {
    throw new Error('card submit blocked')
  }
  const idempotencyKey =
    attempt.phase === 'rejected' || attempt.phase === 'cancelled'
      ? nextKey()
      : attempt.idempotencyKey
  return { idempotencyKey, phase: 'submitting' }
}

export type CardAttemptStep = {
  attempt: CardAttempt
  poll?: boolean
  reloadWallet?: boolean
  rejectBrick?: boolean
}

export function applyCardPayResult(attempt: CardAttempt, result: CardPayResponse): CardAttemptStep {
  const id = usablePurchaseId(result.purchaseId)
  const outcome = result.outcome.trim().toLowerCase()
  const status = result.status.trim().toUpperCase()
  const orderId = usableOrderId(result.orderId)

  const pendingStep = (): CardAttemptStep => ({
    attempt: {
      ...attempt,
      phase: 'pending',
      purchaseId: id,
      message: CARD_PENDING_MESSAGE,
    },
    poll: true,
  })

  const unknownStep = (): CardAttemptStep => ({
    attempt: {
      ...attempt,
      phase: 'unknown',
      purchaseId: id,
      message:
        'Não foi possível confirmar o resultado deste pagamento. Consulte o histórico antes de tentar de novo.',
    },
  })

  switch (outcome) {
    case 'approved':
      if (status === 'PAID' && id) {
        return {
          attempt: {
            ...attempt,
            phase: 'approved',
            purchaseId: id,
            message: CARD_APPROVED_MESSAGE,
          },
          reloadWallet: true,
        }
      }
      if (id && orderId) return pendingStep()
      return unknownStep()
    case 'rejected':
      return {
        attempt: {
          ...attempt,
          phase: 'rejected',
          purchaseId: id,
          message: CARD_REJECTED_MESSAGE,
        },
        rejectBrick: true,
      }
    case 'cancelled':
      return {
        attempt: {
          ...attempt,
          phase: 'cancelled',
          purchaseId: id,
          message: 'Pagamento cancelado. Nenhum crédito foi adicionado.',
        },
        rejectBrick: true,
      }
    case 'refunded':
      return {
        attempt: {
          ...attempt,
          phase: 'refunded',
          purchaseId: id,
          message: 'Este pagamento foi estornado. Nenhum crédito será adicionado.',
        },
      }
    case 'pending':
      if (id && orderId) return pendingStep()
      return unknownStep()
    default:
      if (id && orderId) return pendingStep()
      return unknownStep()
  }
}

export function applyCardPollStatus(attempt: CardAttempt, rawStatus: string | null | undefined): CardAttemptStep {
  switch ((rawStatus ?? '').trim().toUpperCase()) {
    case 'PAID':
      return {
        attempt: {
          ...attempt,
          phase: 'approved',
          message: CARD_APPROVED_MESSAGE,
          pollTimedOut: false,
        },
        reloadWallet: true,
      }
    case 'FAILED':
      return {
        attempt: {
          ...attempt,
          phase: 'rejected',
          message: CARD_REJECTED_MESSAGE,
          pollTimedOut: false,
        },
      }
    case 'CANCELLED':
      return {
        attempt: {
          ...attempt,
          phase: 'cancelled',
          message: 'Pagamento cancelado. Nenhum crédito foi adicionado.',
          pollTimedOut: false,
        },
      }
    case 'REFUNDED':
      return {
        attempt: {
          ...attempt,
          phase: 'refunded',
          message: 'Este pagamento foi estornado.',
          pollTimedOut: false,
        },
      }
    default:
      return { attempt }
  }
}
