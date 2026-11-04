import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import {
  confirmPasswordReset,
  fetchAuthProviders,
  login,
  registerAccount,
  requestPasswordReset,
  WEB_REGISTRATION_CHANNEL,
} from './auth'

describe('auth api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POST /auth/login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            accessToken: 'jwt',
            user: {
              id: 'u1',
              name: 'A',
              email: 'a@b.com',
              role: 'USER',
              state: 'SP',
              city: 'São Paulo',
            },
          }),
      }),
    )
    const api = new ApiClient()
    const result = await login(api, { email: 'a@b.com', password: 'secret' })
    expect(result.accessToken).toBe('jwt')
  })

  it('POST /auth/register envia after_web', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          accessToken: 'jwt',
          user: { id: 'u1', name: 'A', email: 'a@b.com', role: 'USER', state: 'SP', city: 'X' },
        }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    await registerAccount(api, {
      name: 'A',
      email: 'a@b.com',
      password: 'secret1',
      state: 'SP',
      city: 'X',
      role: 'USER',
      ageBand: 'AGE_19_35',
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.registrationChannel).toBe(WEB_REGISTRATION_CHANNEL)
  })

  it('GET /auth/providers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ googleBrowser: true, appleBrowser: false }),
      }),
    )
    const flags = await fetchAuthProviders()
    expect(flags.googleBrowser).toBe(true)
  })

  it('POST password-reset', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new ApiClient()
    await requestPasswordReset(api, 'User@Mail.com')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.email).toBe('user@mail.com')
    await confirmPasswordReset(api, {
      token: 'tok12345678',
      password: 'newpass',
      passwordConfirmation: 'newpass',
    })
    expect(String(fetchMock.mock.calls[1][0])).toContain('/auth/password-reset/confirm')
  })
})
