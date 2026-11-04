import { describe, expect, it } from 'vitest'
import type { AuthUser } from '../../api/types/auth'
import { canManageVenue } from './permissions'

const venueUser: AuthUser = {
  id: 'o1',
  name: 'Owner',
  email: 'o@test.com',
  role: 'VENUE',
  state: 'SP',
  city: 'São Paulo',
  venueId: 'v1',
}

describe('venue manage permissions', () => {
  it('só VENUE com venueId da sessão', () => {
    expect(canManageVenue(venueUser, 'v1')).toBe(true)
    expect(canManageVenue(venueUser, 'v2')).toBe(false)
    expect(canManageVenue({ ...venueUser, role: 'USER' }, 'v1')).toBe(false)
  })
})
