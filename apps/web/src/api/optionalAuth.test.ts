import { describe, expect, it } from 'vitest'
import { isOptionalAuthGet, normalizeApiPath } from './optionalAuth'

describe('normalizeApiPath', () => {
  it('remove query e barra final', () => {
    expect(normalizeApiPath('/venues/search?q=1')).toBe('/venues/search')
    expect(normalizeApiPath('home/promotions/')).toBe('/home/promotions')
  })
})

describe('isOptionalAuthGet', () => {
  it('marca rotas públicas opcionais', () => {
    expect(isOptionalAuthGet('/home/promotions')).toBe(true)
    expect(isOptionalAuthGet('/home/venues')).toBe(true)
    expect(isOptionalAuthGet('/venues/search')).toBe(true)
    expect(isOptionalAuthGet('/venues/abc')).toBe(true)
  })

  it('exclui segmentos reservados', () => {
    expect(isOptionalAuthGet('/venues/geocode')).toBe(false)
    expect(isOptionalAuthGet('/venues/search')).toBe(true)
  })
})
