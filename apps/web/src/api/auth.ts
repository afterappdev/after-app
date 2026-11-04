import type { ApiClient } from './client'
import type { AuthUser, LoginResponse } from './types/auth'

export interface LoginPayload {
  email: string
  password: string
}

function normalizeUser(raw: Record<string, unknown>): AuthUser {
  const venue = raw.venue
  const nestedVenueId =
    venue && typeof venue === 'object' && venue !== null && 'id' in venue
      ? String((venue as { id: unknown }).id)
      : null
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    role: raw.role as AuthUser['role'],
    state: String(raw.state ?? ''),
    city: String(raw.city ?? ''),
    avatarUrl:
      raw.avatarUrl === null || raw.avatarUrl === undefined
        ? null
        : String(raw.avatarUrl),
    venueId:
      raw.venueId !== undefined && raw.venueId !== null
        ? String(raw.venueId)
        : nestedVenueId,
  }
}

export async function login(
  api: ApiClient,
  payload: LoginPayload,
): Promise<LoginResponse> {
  const data = await api.post<Record<string, unknown>>('/auth/login', payload)
  const accessToken = String(data.accessToken ?? '')
  if (!accessToken) {
    throw new Error('Resposta de login sem accessToken.')
  }
  const userRaw = data.user
  if (!userRaw || typeof userRaw !== 'object') {
    throw new Error('Resposta de login sem usuário.')
  }
  return {
    accessToken,
    user: normalizeUser(userRaw as Record<string, unknown>),
  }
}

export async function fetchMe(api: ApiClient): Promise<AuthUser> {
  const data = await api.get<Record<string, unknown>>('/users/me')
  return normalizeUser(data)
}
