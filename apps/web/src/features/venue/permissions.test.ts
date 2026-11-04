import { describe, expect, it } from 'vitest'
import type { AuthUser } from '../../api/types/auth'
import type { VenueDetail } from './types'
import {
  canBlockOrReport,
  canFavorite,
  canReply,
  canReview,
  canShowSafetyActions,
  isVenueOwner,
} from './permissions'

const venue: VenueDetail = { id: 'v1', name: 'Bar', reviewCount: 0 }

const user: AuthUser = {
  id: 'u1',
  name: 'User',
  email: 'u@test.com',
  role: 'USER',
  state: 'SP',
  city: 'São Paulo',
}

const owner: AuthUser = {
  id: 'o1',
  name: 'Owner',
  email: 'o@test.com',
  role: 'VENUE',
  state: 'SP',
  city: 'São Paulo',
  venueId: 'v1',
}

describe('venue permissions', () => {
  it('owner detecta isOwner e venueId', () => {
    expect(isVenueOwner(owner, { ...venue, isOwner: true })).toBe(true)
    expect(isVenueOwner(owner, venue)).toBe(true)
    expect(isVenueOwner(user, venue)).toBe(false)
  })

  it('favorito e avaliação só USER não-dono', () => {
    expect(canFavorite(user)).toBe(true)
    expect(canFavorite(owner)).toBe(false)
    expect(canReview(user, venue)).toBe(true)
    expect(canReview(owner, { ...venue, isOwner: true })).toBe(false)
  })

  it('resposta só dono; denunciar/bloquear não-dono', () => {
    expect(canReply(owner, venue)).toBe(true)
    expect(canReply(user, venue)).toBe(false)
    expect(canBlockOrReport(user, venue)).toBe(true)
    expect(canBlockOrReport(owner, venue)).toBe(false)
    expect(canShowSafetyActions(user, venue)).toBe(true)
    expect(canShowSafetyActions(owner, venue)).toBe(false)
  })
})
