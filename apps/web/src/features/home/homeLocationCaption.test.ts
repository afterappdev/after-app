import { describe, expect, it } from 'vitest'
import { homeLocationCaption } from './homeLocationCaption'

describe('homeLocationCaption', () => {
  it('null para placeholder Sua cidade', () => {
    expect(
      homeLocationCaption({
        displayedCity: 'Sua cidade',
        displayedUf: '',
        profileCity: 'Curitiba',
        profileUf: 'PR',
      }),
    ).toBeNull()
  })

  it('Sua cidade quando coincide com perfil', () => {
    expect(
      homeLocationCaption({
        displayedCity: 'Curitiba',
        displayedUf: 'PR',
        profileCity: 'Curitiba',
        profileUf: 'PR',
      }),
    ).toBe('Sua cidade')
  })

  it('Cidade selecionada quando difere do perfil', () => {
    expect(
      homeLocationCaption({
        displayedCity: 'São Paulo',
        displayedUf: 'SP',
        profileCity: 'Curitiba',
        profileUf: 'PR',
      }),
    ).toBe('Cidade selecionada')
  })
})
