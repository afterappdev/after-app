/** Paridade API `ACCOUNT_RECOVERY_TYP` — só leitura do payload, sem verificar assinatura. */
export const ACCOUNT_RECOVERY_JWT_TYP = 'account_recovery'

export type JwtPayloadSlice = {
  sub?: string
  email?: string
  role?: string
  typ?: string
}

export function readJwtPayloadUnsafe(token: string): JwtPayloadSlice | null {
  const parts = token.trim().split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json) as JwtPayloadSlice
  } catch {
    return null
  }
}

export function isAccountRecoveryJwt(token: string): boolean {
  const payload = readJwtPayloadUnsafe(token)
  return payload?.typ === ACCOUNT_RECOVERY_JWT_TYP
}
