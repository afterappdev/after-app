import { ApiClient } from './client'
import type { ApiClient as ApiClientType } from './client'
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

export async function fetchUserMe(api: ApiClientType): Promise<UserMe> {
  const data = await api.get<Record<string, unknown>>('/users/me')
  const user = normalizeUser(data)
  const ageBand = data.ageBand as AgeBand | null | undefined
  return { ...user, ageBand: ageBand ?? null }
}

export async function updateUserMe(
  api: ApiClientType,
  payload: UpdateUserPayload,
): Promise<UserMe> {
  const data = await api.patch<Record<string, unknown>>('/users/me', payload)
  const user = normalizeUser(data)
  const ageBand = data.ageBand as AgeBand | null | undefined
  return { ...user, ageBand: ageBand ?? null }
}

export async function changeUserPassword(
  api: ApiClientType,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await api.patch('/users/me/password', { currentPassword, newPassword })
}

export async function requestAccountDeletion(api: ApiClientType): Promise<Record<string, unknown>> {
  return api.post<Record<string, unknown>>('/users/me/deletion-request')
}

export async function confirmAccountDeletionByToken(
  token: string,
): Promise<void> {
  const api = new ApiClient()
  await api.post('/users/delete-confirm', { token: token.trim() })
}

export async function requestAccountDeletionByEmail(email: string): Promise<void> {
  const api = new ApiClient()
  await api.post('/users/delete-request', { email: email.trim().toLowerCase() })
}

export type DeletionStatusView = {
  accountStatus: string
  deletionRequestedAt: string | null
  permanentDeletionAt: string | null
  remainingSeconds: number
}

export async function fetchDeletionStatus(recoveryToken: string): Promise<DeletionStatusView> {
  const api = new ApiClient({ getToken: () => recoveryToken.trim() })
  const data = await api.get<Record<string, unknown>>('/users/me/deletion-status')
  return {
    accountStatus: String(data.accountStatus ?? ''),
    deletionRequestedAt:
      data.deletionRequestedAt == null ? null : String(data.deletionRequestedAt),
    permanentDeletionAt:
      data.permanentDeletionAt == null ? null : String(data.permanentDeletionAt),
    remainingSeconds: Number(data.remainingSeconds ?? 0),
  }
}

export async function cancelAccountDeletion(recoveryToken: string): Promise<void> {
  const api = new ApiClient({ getToken: () => recoveryToken.trim() })
  await api.post('/users/me/deletion-cancel')
}
