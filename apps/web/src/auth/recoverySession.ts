import type { AuthUser } from '../api/types/auth'
import { readJwtPayloadUnsafe } from '../utils/jwtPayload'

const RECOVERY_TOKEN_KEY = 'after_web_recovery_token'

export function readStoredRecoveryToken(): string | null {
  try {
    return sessionStorage.getItem(RECOVERY_TOKEN_KEY)
  } catch {
    return null
  }
}

export function persistRecoveryToken(token: string): void {
  sessionStorage.setItem(RECOVERY_TOKEN_KEY, token.trim())
}

export function clearRecoveryToken(): void {
  sessionStorage.removeItem(RECOVERY_TOKEN_KEY)
}

export function minimalUserFromRecoveryToken(token: string): AuthUser | null {
  const payload = readJwtPayloadUnsafe(token)
  if (!payload?.sub || !payload.email) return null
  const role = payload.role === 'VENUE' ? 'VENUE' : 'USER'
  return {
    id: String(payload.sub),
    name: String(payload.email),
    email: String(payload.email),
    role,
    state: '',
    city: '',
    avatarUrl: null,
    venueId: null,
  }
}
