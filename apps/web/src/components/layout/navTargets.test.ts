import { describe, expect, it } from 'vitest'
import type { AuthUser } from '../../api/types/auth'
import { isPublicationCreditsRoute, thirdSlot } from './navTargets'

function user(role: AuthUser['role'], venueId: string | null = null): AuthUser {
  return {
    id: 'u1',
    name: 'Teste',
    email: 'a@b.c',
    role,
    venueId,
    city: '',
    state: '',
  }
}

describe('isPublicationCreditsRoute', () => {
  it('só a tela de publicação, não comprar', () => {
    expect(isPublicationCreditsRoute('/estabelecimento/creditos')).toBe(true)
    expect(isPublicationCreditsRoute('/estabelecimento/creditos/')).toBe(true)
    expect(isPublicationCreditsRoute('/estabelecimento/creditos/comprar')).toBe(false)
    expect(isPublicationCreditsRoute('/estabelecimento')).toBe(false)
  })
})

describe('thirdSlot', () => {
  it('visitante pede login e não abre rota de estabelecimento', () => {
    expect(thirdSlot(null)).toEqual({
      to: '/login',
      label: 'Favoritos',
      state: { from: 'perfil/favoritos' },
    })
  })

  it('USER abre favoritos', () => {
    expect(thirdSlot(user('USER'))).toEqual({
      to: '/perfil/favoritos',
      label: 'Favoritos',
    })
  })

  it('VENUE abre nova publicação, não a compra de créditos', () => {
    const slot = thirdSlot(user('VENUE', 'v1'))
    expect(slot.label).toBe('Publicar')
    expect(slot.to).toBe('/estabelecimento/creditos#nova-publicacao')
    expect(slot.to.includes('comprar')).toBe(false)
  })
})
