import { describe, expect, it } from 'vitest'
import { sanitizeOAuthErrorMessage } from './oauthCallback'

describe('oauthCallback', () => {
  it('sanitizeOAuthErrorMessage remove JSON técnico', () => {
    expect(sanitizeOAuthErrorMessage('{"statusCode":401}')).toBe(
      'Não foi possível concluir o login social.',
    )
    expect(sanitizeOAuthErrorMessage('E-mail já cadastrado')).toBe('E-mail já cadastrado')
  })
})
