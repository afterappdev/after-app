import { ApiError } from '../api/client'

export function friendlyPixError(error: unknown): string {
  if (error instanceof ApiError) {
    return friendlyPixErrorFrom(error.statusCode, error.message)
  }
  return friendlyPixErrorFrom(undefined, null)
}

export function friendlyPixErrorFrom(statusCode?: number, message?: string | null): string {
  const text = (message ?? '').trim()
  const lower = text.toLowerCase()
  if (statusCode === 401) return 'Sua sessão expirou. Entre novamente.'
  if (statusCode === 404) return 'Não encontramos essa compra. Volte e tente novamente.'
  if (
    statusCode === 503 ||
    lower.includes('not configured') ||
    lower.includes('provider is not configured')
  ) {
    return 'Pagamento por PIX ainda não está disponível.'
  }
  if (text.length) return text
  return 'Não foi possível iniciar o PIX. Tente novamente.'
}

export function friendlyCardConfigError(error: unknown): string {
  if (error instanceof ApiError) {
    const lower = error.message.toLowerCase()
    if (error.statusCode === 503 || lower.includes('não está disponível')) {
      return 'Pagamento por cartão ainda não está disponível. Você ainda pode pagar com PIX.'
    }
    if (error.message.trim()) return error.message
  }
  return 'Pagamento por cartão ainda não está disponível. Você ainda pode pagar com PIX.'
}
