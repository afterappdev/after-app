import { describe, expect, it } from 'vitest'
import type { AuthUser } from '../../api/types/auth'
import { sessionGuardPhase, userGuardPhase, venueGuardPhase } from './guardRules'

const user: AuthUser = {
  id: 'u1',
  name: 'U',
  email: 'u@x.com',
  role: 'USER',
  state: 'SP',
  city: 'X',
  avatarUrl: null,
  venueId: null,
}

const venue: AuthUser = {
  ...user,
  id: 'v1',
  role: 'VENUE',
  venueId: 'ven1',
}

describe('guardRules', () => {
  it('guest: sem user', () => {
    expect(sessionGuardPhase(false, null)).toBe('guest')
    expect(userGuardPhase(false, null)).toBe('guest')
    expect(venueGuardPhase(false, null, null)).toBe('guest')
  })

  it('loading', () => {
    expect(sessionGuardPhase(true, null)).toBe('loading')
    expect(userGuardPhase(true, user)).toBe('loading')
  })

  it('USER area', () => {
    expect(userGuardPhase(false, user)).toBe('ok')
    expect(userGuardPhase(false, venue)).toBe('wrong_role')
  })

  it('VENUE area', () => {
    expect(venueGuardPhase(false, venue, 'ven1')).toBe('ok')
    expect(venueGuardPhase(false, venue, null)).toBe('wrong_role')
    expect(venueGuardPhase(false, user, null)).toBe('wrong_role')
  })

  it('recovery minimal user ainda passa session e USER guard', () => {
    const recoveryUser: AuthUser = { ...user, name: user.email }
    expect(sessionGuardPhase(false, recoveryUser)).toBe('ok')
    expect(userGuardPhase(false, recoveryUser)).toBe('ok')
  })
})
