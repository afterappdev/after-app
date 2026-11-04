import type { ApiClient } from './client'
import type { AuthUser } from './types/auth'
import type { AgeBand } from '../constants/ageBands'
import { normalizeUser } from './auth'

export type UserMe = AuthUser & {
  ageBand?: AgeBand | null
}

export type UpdateUserPayload = {
  name?: string
  city?: string
  state?: string
  avatarUrl?: string | null
  ageBand?: AgeBand | null
}

export async function fetchUserMe(api: ApiClient): Promise<UserMe> {
  const data = await api.get<Record<string, unknown>>('/users/me')
  const user = normalizeUser(data)
  const ageBand = data.ageBand as AgeBand | null | undefined
  return { ...user, ageBand: ageBand ?? null }
}

export async function updateUserMe(
  api: ApiClient,
  payload: UpdateUserPayload,
): Promise<UserMe> {
  const data = await api.patch<Record<string, unknown>>('/users/me', payload)
  const user = normalizeUser(data)
  const ageBand = data.ageBand as AgeBand | null | undefined
  return { ...user, ageBand: ageBand ?? null }
}
