import type { ApiClient } from './client'
import type { NotificationItem } from '../features/profile/types'

function mapNotification(raw: Record<string, unknown>): NotificationItem {
  const venueRaw = raw.venue as Record<string, unknown> | undefined
  return {
    id: String(raw.id ?? ''),
    title: raw.title != null ? String(raw.title) : null,
    body: raw.body != null ? String(raw.body) : null,
    readAt: raw.readAt != null ? String(raw.readAt) : null,
    createdAt: raw.createdAt != null ? String(raw.createdAt) : null,
    venueId: raw.venueId != null ? String(raw.venueId) : venueRaw?.id != null ? String(venueRaw.id) : null,
    venue: venueRaw
      ? {
          id: String(venueRaw.id ?? ''),
          name: String(venueRaw.name ?? ''),
          logoUrl: venueRaw.logoUrl as string | null | undefined,
          coverUrl: venueRaw.coverUrl as string | null | undefined,
        }
      : null,
  }
}

export async function fetchNotifications(api: ApiClient): Promise<NotificationItem[]> {
  const data = await api.get<unknown>('/notifications')
  if (!Array.isArray(data)) return []
  return data
    .map((item) =>
      item && typeof item === 'object'
        ? mapNotification(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is NotificationItem => !!item?.id)
}

export async function fetchUnreadNotificationCount(api: ApiClient): Promise<number> {
  const data = await api.get<{ count?: number }>('/notifications/unread-count')
  return typeof data.count === 'number' ? data.count : 0
}

export async function markNotificationRead(api: ApiClient, id: string): Promise<void> {
  await api.patch(`/notifications/${encodeURIComponent(id)}/read`)
}

export async function markAllNotificationsRead(api: ApiClient): Promise<void> {
  await api.patch('/notifications/read-all')
}
