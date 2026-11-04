import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/notifications'
import { AsyncPanel } from '../../components/common/AsyncPanel'
import { useAuth } from '../../auth/AuthContext'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import type { NotificationItem } from './types'

function timeLabel(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const diffMs = Date.now() - parsed.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `há ${days} d`
  const d = parsed.getDate().toString().padStart(2, '0')
  const m = (parsed.getMonth() + 1).toString().padStart(2, '0')
  return `${d}/${m}`
}

export function NotificationsPage() {
  const { api } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchNotifications(api)
      setItems(rows)
      await markAllNotificationsRead(api)
      setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar notificações.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  async function openItem(item: NotificationItem) {
    const venueId = item.venue?.id ?? item.venueId
    if (!venueId) return
    if (!item.readAt) {
      try {
        await markNotificationRead(api, item.id)
      } catch {
        /* ignore */
      }
    }
    navigate(`/venue/${encodeURIComponent(venueId)}`)
  }

  return (
    <div className="mx-auto vstack gap-3" style={{ maxWidth: 520 }}>
      <div className="d-flex align-items-center gap-2">
        <Link to="/perfil" className="btn btn-sm btn-outline-secondary">
          ← Perfil
        </Link>
        <h1 className="h5 mb-0">Notificações</h1>
      </div>
      <AsyncPanel
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={!loading && !error && items.length === 0}
        emptyMessage="Nenhuma notificação ainda. Quando um local favorito publicar, você vê aqui."
      >
        <div className="vstack gap-2">
          {items.map((item) => {
            const venue = item.venue
            const logo = resolveMediaUrl(venue?.logoUrl ?? venue?.coverUrl)
            const unread = !item.readAt
            return (
              <button
                key={item.id}
                type="button"
                className="btn btn-light text-start border-0 shadow-sm p-3"
                onClick={() => void openItem(item)}
              >
                <div className="d-flex gap-3">
                  {logo ? (
                    <img src={logo} alt="" width={44} height={44} className="rounded-circle object-fit-cover" />
                  ) : (
                    <div className="rounded-circle bg-light" style={{ width: 44, height: 44 }} />
                  )}
                  <div className="flex-grow-1">
                    <p className={`mb-1 small ${unread ? 'fw-bold' : 'fw-semibold'}`}>
                      {item.title ?? 'Nova publicação'}
                    </p>
                    {item.body ? <p className="small text-muted mb-1">{item.body}</p> : null}
                    <p className="small text-muted mb-0">{timeLabel(item.createdAt)}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </AsyncPanel>
    </div>
  )
}
