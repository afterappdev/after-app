import { afterEach, describe, expect, it } from 'vitest'
import {
  clearRecoveryToken,
  minimalUserFromRecoveryToken,
  persistRecoveryToken,
  readStoredRecoveryToken,
} from './recoverySession'

function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none' }))
  const body = btoa(JSON.stringify(payload))
  return `${header}.${body}.sig`
}

describe('recoverySession', () => {
  afterEach(() => {
    clearRecoveryToken()
  })

  it('persiste token em sessionStorage', () => {
    persistRecoveryToken(' tok ')
    expect(readStoredRecoveryToken()).toBe('tok')
  })

  it('minimalUserFromRecoveryToken', () => {
    const token = fakeJwt({
      sub: 'u1',
      email: 'a@b.com',
      role: 'VENUE',
      typ: 'account_recovery',
    })
    const user = minimalUserFromRecoveryToken(token)
    expect(user?.id).toBe('u1')
    expect(user?.role).toBe('VENUE')
  })
})
