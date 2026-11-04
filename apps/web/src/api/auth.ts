import { ApiClient } from './client'
import type { ApiClient as ApiClientType } from './client'
import type { AuthUser, LoginResponse } from './types/auth'
import type { AgeBand } from '../constants/ageBands'

export const WEB_REGISTRATION_CHANNEL = 'after_web'

export interface LoginPayload {
  email: string
  password: string
}

export type AuthProviders = {
  google?: boolean
  googleBrowser?: boolean
  apple?: boolean
  appleBrowser?: boolean
}

export type RegisterPayload = {
  name: string
  email: string
  password: string
  state: string
  city: string
  role: 'USER' | 'VENUE'
  documentType?: 'CPF' | 'CNPJ'
  documentNumber?: string
  ageBand?: AgeBand
}

export type CompleteSocialRegistrationPayload = {
  onboardingToken: string
  accountType: 'user' | 'venue'
  name: string
  state: string
  city: string
  password?: string
  documentType?: 'CPF' | 'CNPJ'
  documentNumber?: string
  ageBand?: AgeBand
}

export function normalizeUser(raw: Record<string, unknown>): AuthUser {
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
  api: ApiClientType,
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

export async function fetchMe(api: ApiClientType): Promise<AuthUser> {
  const data = await api.get<Record<string, unknown>>('/users/me')
  return normalizeUser(data)
}

function parseLoginResponse(data: Record<string, unknown>): LoginResponse {
  const accessToken = String(data.accessToken ?? '')
  if (!accessToken) {
    throw new Error('Resposta sem accessToken.')
  }
  const userRaw = data.user
  if (!userRaw || typeof userRaw !== 'object') {
    throw new Error('Resposta sem usuário.')
  }
  return {
    accessToken,
    user: normalizeUser(userRaw as Record<string, unknown>),
  }
}

export async function fetchAuthProviders(): Promise<AuthProviders> {
  const api = new ApiClient()
  return api.get<AuthProviders>('/auth/providers')
}

export async function registerAccount(
  api: ApiClientType,
  payload: RegisterPayload,
): Promise<LoginResponse> {
  const data = await api.post<Record<string, unknown>>(
    '/auth/register',
    {
      ...payload,
      name: payload.name.trim(),
      email: payload.email.trim(),
      state: payload.state.trim(),
      city: payload.city.trim(),
      registrationChannel: WEB_REGISTRATION_CHANNEL,
    },
    undefined,
  )
  return parseLoginResponse(data)
}

export async function completeSocialRegistration(
  api: ApiClientType,
  payload: CompleteSocialRegistrationPayload,
): Promise<LoginResponse> {
  const data = await api.post<Record<string, unknown>>('/auth/social/complete-registration', {
    ...payload,
    name: payload.name.trim(),
    state: payload.state.trim(),
    city: payload.city.trim(),
    registrationChannel: WEB_REGISTRATION_CHANNEL,
  })
  return parseLoginResponse(data)
}

export async function exchangeAppleWebLogin(
  api: ApiClientType,
  code: string,
): Promise<Record<string, unknown>> {
  return api.post<Record<string, unknown>>('/auth/apple/web/exchange', { code: code.trim() })
}

export async function requestPasswordReset(api: ApiClientType, email: string): Promise<void> {
  await api.post('/auth/password-reset/request', { email: email.trim().toLowerCase() })
}

export async function confirmPasswordReset(
  api: ApiClientType,
  body: { token: string; password: string; passwordConfirmation: string },
): Promise<void> {
  await api.post('/auth/password-reset/confirm', body)
}
