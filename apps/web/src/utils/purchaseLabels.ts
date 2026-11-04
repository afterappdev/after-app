export function isTerminalPurchaseStatus(status: string | null | undefined): boolean {
  switch ((status ?? '').toUpperCase()) {
    case 'PAID':
    case 'FAILED':
    case 'CANCELLED':
    case 'REFUNDED':
      return true
    default:
      return false
  }
}

export function purchaseStatusLabel(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'PENDING':
      return 'Aguardando pagamento'
    case 'PAID':
      return 'Pago'
    case 'FAILED':
      return 'Falhou'
    case 'CANCELLED':
      return 'Cancelado'
    case 'REFUNDED':
      return 'Reembolsado'
    default:
      return 'Aguardando pagamento'
  }
}

export function purchaseProviderLabel(provider: string | null | undefined): string {
  switch ((provider ?? '').trim().toLowerCase()) {
    case 'google_play':
      return 'Google Play'
    case 'app_store':
    case 'apple_app_store':
      return 'App Store'
    case 'pix':
      return 'PIX'
    case 'card':
      return 'Cartão de crédito'
    case 'stub':
      return 'Desenvolvimento'
    default:
      return ''
  }
}
