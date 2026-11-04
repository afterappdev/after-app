import { describe, expect, it } from 'vitest'
import { ACCOUNT_RECOVERY_JWT_TYP, isAccountRecoveryJwt, readJwtPayloadUnsafe } from './jwtPayload'

function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  return `${header}.${body}.sig`
}

describe('jwtPayload', () => {
  it('detecta recovery typ', () => {
    const token = fakeJwt({ sub: 'u1', email: 'a@b.com', typ: ACCOUNT_RECOVERY_JWT_TYP })
    expect(isAccountRecoveryJwt(token)).toBe(true)
    expect(readJwtPayloadUnsafe(token)?.sub).toBe('u1')
  })

  it('sessão normal não é recovery', () => {
    const token = fakeJwt({ sub: 'u1', email: 'a@b.com', role: 'USER' })
    expect(isAccountRecoveryJwt(token)).toBe(false)
  })
})
