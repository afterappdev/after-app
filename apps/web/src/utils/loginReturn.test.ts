import { describe, expect, it } from 'vitest'
import { loginNavigationState, loginReturnPath } from './loginReturn'

describe('loginReturn', () => {
  it('normaliza path de retorno', () => {
    expect(loginReturnPath('/venue/abc')).toBe('venue/abc')
    expect(loginNavigationState('venue/abc').state.from).toBe('venue/abc')
  })
})
