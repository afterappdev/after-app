import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelAccountDeletion, fetchDeletionStatus } from './users'

describe('users deletion recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET deletion-status com recovery Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          accountStatus: 'PENDING_DELETION',
          remainingSeconds: 120,
          deletionRequestedAt: null,
          permanentDeletionAt: null,
        }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const status = await fetchDeletionStatus('recovery.jwt')
    expect(status.remainingSeconds).toBe(120)
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer recovery.jwt')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/users/me/deletion-status')
  })

  it('POST deletion-cancel', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await cancelAccountDeletion('recovery.jwt')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/users/me/deletion-cancel')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })

  it('oauth start URL shape sem token real', () => {
    const api = 'https://api.example.test'
    const redirect = encodeURIComponent('https://app-after.com.br/app/')
    const url = `${api}/auth/google/start?redirect=${redirect}`
    expect(url).toContain('/auth/google/start?redirect=')
    expect(decodeURIComponent(url.split('redirect=')[1] ?? '')).toBe('https://app-after.com.br/app/')
  })
})
