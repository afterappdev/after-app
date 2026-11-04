import { describe, expect, it } from 'vitest'
import {
  oauthBrowserRedirect,
  oauthStartUrl,
  oauthTokenFromLocation,
  sanitizeOAuthErrorMessage,
} from './oauthCallback'

describe('oauthCallback', () => {
  it('sanitizeOAuthErrorMessage remove JSON técnico', () => {
    expect(sanitizeOAuthErrorMessage('{"statusCode":401}')).toBe(
      'Não foi possível concluir o login social.',
    )
    expect(sanitizeOAuthErrorMessage('E-mail já cadastrado')).toBe('E-mail já cadastrado')
  })

  it('oauthStartUrl usa redirect /app/ encoded', () => {
    const url = oauthStartUrl('google', 'https://api.test')
    expect(url).toBe(
      'https://api.test/auth/google/start?redirect=' +
        encodeURIComponent(oauthBrowserRedirect()),
    )
  })

  it('oauthTokenFromLocation lê query sem token real', () => {
    const params = new URLSearchParams('error=access_denied')
    expect(oauthTokenFromLocation(params)).toBeNull()
    expect(oauthTokenFromLocation(new URLSearchParams('token=***'))).toBe('***')
  })

})
